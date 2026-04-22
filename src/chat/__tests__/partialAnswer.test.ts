import { describe, it, expect } from 'vitest'
import { extractPartialAnswer, makeAnswerTracker } from '@/chat/partialAnswer'

describe('extractPartialAnswer — key absence', () => {
  it('returns null for an empty buffer', () => {
    expect(extractPartialAnswer('')).toBeNull()
  })

  it('returns null when the answer key has not appeared yet', () => {
    expect(extractPartialAnswer('{"can_answer": true, "answer"')).toBeNull()
  })
})

describe('extractPartialAnswer — simple strings', () => {
  it('returns the partial string when the closing quote has not arrived', () => {
    expect(extractPartialAnswer('{"can_answer": true, "answer": "Hello'))
      .toBe('Hello')
  })

  it('returns the complete string once the closing quote is present', () => {
    expect(extractPartialAnswer('{"can_answer": true, "answer": "Hello"}'))
      .toBe('Hello')
  })
})

describe('extractPartialAnswer — escape sequences', () => {
  it('decodes escaped quotes inside the answer value', () => {
    // JSON source: {"answer": "Hello \"world\""}
    const buf = '{"can_answer": true, "answer": "Hello \\"world\\""}'
    expect(extractPartialAnswer(buf)).toBe('Hello "world"')
  })

  it('decodes \\n escape into a literal newline', () => {
    const buf = '{"can_answer": true, "answer": "First line\\nSecond"}'
    expect(extractPartialAnswer(buf)).toBe('First line\nSecond')
  })

  it('decodes \\uXXXX unicode escapes', () => {
    // é → é
    const buf = '{"can_answer": true, "answer": "\\u00e9clat"}'
    expect(extractPartialAnswer(buf)).toBe('éclat')
  })
})

describe('extractPartialAnswer — truncated-escape contract', () => {
  it('stops at a trailing bare backslash without emitting it', () => {
    // Buffer ends mid-escape: "...Hello \"
    // Expected: emit "Hello " (space preserved, backslash withheld).
    const buf = '{"can_answer": true, "answer": "Hello \\'
    expect(extractPartialAnswer(buf)).toBe('Hello ')
  })

  it('resumes and emits the completed escape on the next tick', () => {
    // First tick stops at "Hello " (backslash withheld); next tick receives
    // the full "\n more" sequence.
    const next = '{"can_answer": true, "answer": "Hello \\n more"}'
    expect(extractPartialAnswer(next)).toBe('Hello \n more')
  })

  it('stops before a truncated \\u sequence with fewer than 4 hex digits', () => {
    // "\u00" is only 2 of 4 hex digits — must withhold entirely.
    const buf = '{"can_answer": true, "answer": "Caf\\u00'
    expect(extractPartialAnswer(buf)).toBe('Caf')
  })
})

describe('makeAnswerTracker — incremental delta across ticks', () => {
  it('emits partial delta on first tick, completes on second tick', () => {
    const tick = makeAnswerTracker()

    // Tick 1: buffer contains "He" (no closing quote yet).
    const first = tick('{"can_answer": true, "answer": "He')
    expect(first.delta).toBe('He')
    expect(first.done).toBe(false)

    // Tick 2: buffer extended to include closing quote + remaining chars.
    const second = tick('{"can_answer": true, "answer": "Hello"}')
    expect(second.delta).toBe('llo')
    expect(second.done).toBe(true)
  })

  it('returns empty delta + done=false while the answer key is still absent', () => {
    const tick = makeAnswerTracker()
    const out = tick('{"can_answer": true, "answer"')
    expect(out).toEqual({ delta: '', done: false })
  })

  it('sets done=true immediately when the closing quote is present on first tick', () => {
    const tick = makeAnswerTracker()
    const out = tick('{"can_answer": true, "answer": "Done"}')
    expect(out.delta).toBe('Done')
    expect(out.done).toBe(true)
  })
})
