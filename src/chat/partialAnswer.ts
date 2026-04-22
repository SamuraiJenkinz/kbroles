/**
 * Partial-JSON extractor for the `answer` string value of the KB response schema.
 *
 * The Phase-1 schema is `{ can_answer, answer, citations }` with `answer`
 * appearing BEFORE `citations` in JSON-Schema property order (02-CONTEXT.md §1
 * "Partial-JSON strategy"). This parser only needs to locate the `"answer":`
 * key, then scan the string value character-by-character, handling the six
 * JSON escape classes (`\"`, `\\`, `\/`, `\b\f\n\r\t`, `\uXXXX`).
 *
 * Algorithm derived from 02-RESEARCH.md §Partial-JSON Parser. Hand-rolled over
 * a library dep: ~60 lines of deterministic logic with well-defined failure
 * modes beats a transitive dep for this narrow use case.
 *
 * Truncated-escape contract: if the buffer ends at a bare `\` OR at `\u` with
 * fewer than 4 following hex digits, the scan STOPS before the incomplete
 * escape. The partial escape is NOT emitted — the next tick extends the
 * buffer and completes the character cleanly. This prevents garbage
 * characters appearing in `answer_delta` frames.
 *
 * Surrogate-pair caveat: a character in the astral plane (U+10000+) requires
 * TWO `\uXXXX` sequences (high surrogate + low surrogate). Per-char
 * `String.fromCharCode` emits each half independently. A stream cut between
 * the two surrogates produces mojibake until the second arrives; this is
 * acceptable because OpenAI's JSON output never emits unmatched surrogates
 * (standard-conformant JSON encoding), so a mid-surrogate cut always resolves
 * in the next tick. Documented in RESEARCH.md §Partial-JSON Parser.
 */

const ANSWER_KEY_RE = /"answer"\s*:\s*"/

const ESCAPE_MAP: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}

/**
 * Given the full accumulated buffer, return the decoded answer string value
 * as much as can be determined.
 *
 *  - Returns `null` if the `"answer":` key has not yet appeared.
 *  - Returns the decoded partial string if the closing quote has not yet
 *    arrived (scanner stops before any incomplete escape).
 *  - Returns the decoded full string once the closing unescaped quote is
 *    reached.
 */
export function extractPartialAnswer(buf: string): string | null {
  const keyMatch = buf.match(ANSWER_KEY_RE)
  if (!keyMatch || keyMatch.index === undefined) return null

  const start = keyMatch.index + keyMatch[0].length
  let result = ''
  let i = start

  while (i < buf.length) {
    const ch = buf[i]

    if (ch === '\\') {
      // Escape sequence: need at least the escape char byte to continue.
      if (i + 1 >= buf.length) break // truncated at trailing backslash — stop

      const esc = buf[i + 1]
      if (esc === 'u') {
        // Unicode escape \uXXXX — need 4 following hex digits.
        if (i + 5 >= buf.length) break // truncated mid-\u — stop
        const hex = buf.slice(i + 2, i + 6)
        result += String.fromCharCode(parseInt(hex, 16))
        i += 6
      } else {
        // Simple escape — 2 bytes.
        result += ESCAPE_MAP[esc] ?? esc
        i += 2
      }
    } else if (ch === '"') {
      // Closing unescaped quote — answer string is complete.
      return result
    } else {
      result += ch
      i++
    }
  }

  // Buffer ran out mid-string (or right before an escape) — return what we have.
  return result
}

/**
 * Scan the slice AFTER the answer key for an unescaped closing quote. Used to
 * detect "done" without re-parsing the value. Shares the escape-handling rule
 * with extractPartialAnswer: a bare trailing `\` is treated as incomplete
 * (not a close).
 */
function hasUnescapedClose(afterKey: string): boolean {
  let i = 0
  while (i < afterKey.length) {
    const ch = afterKey[i]
    if (ch === '\\') {
      if (i + 1 >= afterKey.length) return false // trailing backslash — incomplete
      if (afterKey[i + 1] === 'u') {
        if (i + 5 >= afterKey.length) return false
        i += 6
      } else {
        i += 2
      }
    } else if (ch === '"') {
      return true
    } else {
      i++
    }
  }
  return false
}

export interface AnswerTick {
  delta: string
  done: boolean
}

/**
 * Stateful tick emitter — tracks the previously-emitted length and returns
 * only the incremental delta on each call. `done` is true on the tick where
 * the closing quote arrives.
 *
 * Usage pattern:
 *   const tick = makeAnswerTracker()
 *   for await (chunk of stream) {
 *     buf += chunk
 *     const { delta, done } = tick(buf)
 *     if (delta) emit({ type: 'answer_delta', text: delta })
 *     if (done) break
 *   }
 */
export function makeAnswerTracker(): (buf: string) => AnswerTick {
  let prevLen = 0

  return function tick(buf: string): AnswerTick {
    const full = extractPartialAnswer(buf)
    if (full === null) return { delta: '', done: false }

    const keyMatch = buf.match(ANSWER_KEY_RE)
    let done = false
    if (keyMatch && keyMatch.index !== undefined) {
      const afterKey = buf.slice(keyMatch.index + keyMatch[0].length)
      done = hasUnescapedClose(afterKey)
    }

    const delta = full.slice(prevLen)
    prevLen = full.length
    return { delta, done }
  }
}
