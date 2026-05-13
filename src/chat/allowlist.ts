import {
  ENTITY_ALLOWLIST,
  NAME_RE,
  KB_ID_RE,
  URL_RE,
  SOURCE_CORPUS_LOWERCASE,
} from '@/grounding/entities'

/**
 * Phase-2 entity-allowlist post-check (CORP-02 / 02-CONTEXT.md §2).
 *
 * Scans the final answer text against the three entity classes harvested at
 * module load by `src/grounding/entities.ts`. The purpose is to block
 * fabricated approver names, KB IDs, and URLs from ever reaching the client
 * even when the citation validator has allowed a response through.
 *
 * Ordering rule (02-CONTEXT.md §2 "fail on ANY class"): test names first,
 * then KB IDs, then URLs; return on the first failing class. This matches
 * the logical precedence of CORP-02's three fixtures and keeps the returned
 * `violationClass` deterministic for the test suite.
 *
 * The violating token itself is NOT included in the result — only the class
 * and the token count. Rationale (02-CONTEXT.md §5, PITFALLS #10 line 527):
 * fabricated names in a model response could contain a real person's
 * identity emitted unprompted; treat model output as content, not
 * observability metadata. Drift investigation reproduces against static eval
 * fixtures, which are reviewable.
 *
 * Regexes are imported from `src/grounding/entities.ts` (single source of
 * truth — the same patterns feed the boot-time ENTITY_ALLOWLIST extraction).
 * Re-declaring them here would create a subtle drift risk where a corpus
 * update changes one set but not the other.
 *
 * Only the `answer` field is scanned. Citation `quote` fields are NOT
 * re-scanned because the Phase-1 validator has already proven each quote is
 * a verbatim substring of a registered source body (02-CONTEXT.md §2
 * "Scanned field").
 */
export type AllowlistResult =
  | { passed: true }
  | { passed: false; violationClass: 'names' | 'kbIds' | 'urls'; tokenCount: number }

export function checkEntityAllowlist(answerText: string): AllowlistResult {
  // matchAll() creates a fresh iterator on each invocation, so `/g` lastIndex
  // state does not leak between calls. Use the capture group for names
  // (NAME_RE has a parenthesised group); use match[0] for KB IDs and URLs.
  const names = [...answerText.matchAll(NAME_RE)].map(m => m[1])
  const badNames = names.filter(n => {
    // Tier 1 — strict-equality match against the regex-extracted allowlist
    // (existing CORP-02 behaviour, preserved). Real approver names from KB
    // bodies match here directly.
    if (ENTITY_ALLOWLIST.names.has(n)) return false

    // Quick 011 Tier 2 — case-insensitive substring match against the
    // lowercased source corpus. Catches LLM-introduced title-case variants
    // of source-mentioned terms ("Knowledge Base" when source has
    // "Knowledge base", "Subject Matter" when source has "subject matter
    // expert") which the NAME_RE-based Tier 1 extraction missed because
    // the regex requires both words title-cased.
    if (SOURCE_CORPUS_LOWERCASE.includes(n.toLowerCase())) return false

    // Quick 012 Tier 3 — word-subset check. After Tier 1 and Tier 2 both
    // miss, split the bigram on whitespace and verify EVERY constituent
    // word appears as a substring somewhere in the lowercased corpus.
    // Allows model-paraphrased title-case bigrams that combine source
    // vocabulary into a phrase the source doesn't use verbatim — e.g.
    // "Article Structure" (source uses "Article Body" but both "article"
    // and "structure" appear in source separately) or "Service Now"
    // (source has compound "ServiceNow" — "service" and "now" both appear
    // as substrings). Fabricated names like "Jane Doe" or "Acme
    // Corporation" still fail because at least one constituent word
    // (e.g. "jane", "acme") doesn't appear anywhere in source — CORP-02
    // invented-name guard preserved by the .every() short-circuit.
    //
    // Trade-off: a fabrication where BOTH words coincidentally appear in
    // source (e.g. "Server Room" — common nouns) would pass Tier 3. The
    // threat model has shifted under Quick 009's strict-tools enforcement:
    // schema correctness is now guaranteed by Bedrock, the validator
    // enforces verbatim citation quotes, so the prose is already grounded
    // through other layers. The allowlist is the final belt-and-suspenders
    // check, and tightening Tier 3 further would re-introduce the false-
    // positive surface that Quick 011 + 012 are explicitly closing.
    const words = n.toLowerCase().split(/\s+/)
    if (words.every(w => SOURCE_CORPUS_LOWERCASE.includes(w))) return false

    return true
  })
  if (badNames.length > 0) {
    return { passed: false, violationClass: 'names', tokenCount: badNames.length }
  }

  const kbIds = [...answerText.matchAll(KB_ID_RE)].map(m => m[0])
  const badKbIds = kbIds.filter(k => !ENTITY_ALLOWLIST.kbIds.has(k))
  if (badKbIds.length > 0) {
    return { passed: false, violationClass: 'kbIds', tokenCount: badKbIds.length }
  }

  const urls = [...answerText.matchAll(URL_RE)].map(m => m[0])
  const badUrls = urls.filter(u => !ENTITY_ALLOWLIST.urls.has(u))
  if (badUrls.length > 0) {
    return { passed: false, violationClass: 'urls', tokenCount: badUrls.length }
  }

  return { passed: true }
}
