import { REGISTRY } from '@/grounding/registry'

// MEDIUM-confidence regex per RESEARCH.md Gap 7 / Risk for §1.
// Permissive by design — false positives on title-case noun phrases are
// acceptable (allowlist matches fail open — extra names are harmless).
// False negatives (real approvers missed) would be catastrophic.
const NAME_RE  = /\b([A-Z][a-z]+(?:-[A-Z][a-z]+)?\s+[A-Z][a-z]+(?:-[A-Z][a-z]+)?)\b/g
// KB IDs observed in the corpus vary in digit count (KB0020882 is 7 digits,
// the ServiceNow form sample record KB18801781 is 8). Using \d{5,} keeps the
// match loose enough to capture both without over-matching short
// non-KB-number tokens.
const KB_ID_RE = /\bKB\d{5,}\b/g
const URL_RE   = /https?:\/\/[^\s<>"'\]]+/g

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
