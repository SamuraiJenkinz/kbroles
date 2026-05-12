import { REGISTRY } from '@/grounding/registry'

// MEDIUM-confidence regex per RESEARCH.md Gap 7 / Risk for §1.
// Permissive by design — false positives on title-case noun phrases are
// acceptable (allowlist matches fail open — extra names are harmless).
// False negatives (real approvers missed) would be catastrophic.
//
// Exported so that the Phase-2 allowlist post-check (src/chat/allowlist.ts)
// can reuse these patterns verbatim — single source of truth, no duplicate
// regex definitions in the repo. Plan 02 Task 2.2 authorised the widening.
export const NAME_RE  = /\b([A-Z][a-z]+(?:-[A-Z][a-z]+)?\s+[A-Z][a-z]+(?:-[A-Z][a-z]+)?)\b/g
// KB IDs observed in the corpus vary in digit count (KB0020882 is 7 digits,
// the ServiceNow form sample record KB18801781 is 8). Using \d{5,} keeps the
// match loose enough to capture both without over-matching short
// non-KB-number tokens.
export const KB_ID_RE = /\bKB\d{5,}\b/g
export const URL_RE   = /https?:\/\/[^\s<>"'\]]+/g

export interface EntityAllowlist {
  names: Set<string>
  kbIds: Set<string>
  urls: Set<string>
}

function extract(): EntityAllowlist {
  const names = new Set<string>()
  const kbIds = new Set<string>()
  const urls  = new Set<string>()

  for (const source of Object.values(REGISTRY)) {
    kbIds.add(source.id.startsWith('KB') ? source.id : '')
    kbIds.delete('')
    urls.add(source.url)

    // Pull KB IDs out of the source URL itself (e.g. the ServiceNow form
    // source references sample record KB18801781 in its permalink). Section
    // bodies don't always mention their own KB ID literally, so the URL
    // attribute is the reliable signal.
    for (const m of source.url.matchAll(KB_ID_RE)) kbIds.add(m[0])

    for (const section of source.sections) {
      const body = section.body
      for (const m of body.matchAll(NAME_RE))  names.add(m[1])
      for (const m of body.matchAll(KB_ID_RE)) kbIds.add(m[0])
      for (const m of body.matchAll(URL_RE))   urls.add(m[0])
    }
  }

  return { names, kbIds, urls }
}

export const ENTITY_ALLOWLIST: EntityAllowlist = extract()

/**
 * Quick 011 — concatenated source-body corpus, lowercased, for case-insensitive
 * substring fallback matching in `src/chat/allowlist.ts`. Built at module load
 * alongside ENTITY_ALLOWLIST.
 *
 * Why this exists: NAME_RE requires BOTH words title-cased to match, so
 * source phrases like "Knowledge base" (lowercase b) are never extracted into
 * ENTITY_ALLOWLIST.names. When an LLM response writes the natural variant
 * "Knowledge Base" (title-case both), the answer-side regex match succeeds,
 * but ENTITY_ALLOWLIST.names doesn't contain the title-case form — so the
 * strict-equality check in checkEntityAllowlist() rejects it as fabricated
 * even though the underlying referent IS in the source.
 *
 * This corpus string lets the allowlist post-check do a case-insensitive
 * substring lookup as a second-tier match. If the answer's title-case bigram
 * (lowercased) appears anywhere in the source corpus, the name is allowed
 * through. Pure substring rather than tokenised match — fast, conservative,
 * and preserves the fabricated-name guard because any bigram NOT present in
 * any casing anywhere in the corpus still fails.
 *
 * Memory cost: ~10K chars total across the three SOP sources. Negligible.
 * Per-check cost: one `.toLowerCase()` on the answer-side name + one
 * `.includes()` substring search against the precomputed lowercased corpus.
 */
export const SOURCE_CORPUS_LOWERCASE: string = (() => {
  const bodies: string[] = []
  for (const source of Object.values(REGISTRY)) {
    for (const section of source.sections) {
      bodies.push(section.body)
    }
  }
  return bodies.join('\n').toLowerCase()
})()
