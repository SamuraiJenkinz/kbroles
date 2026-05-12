---
phase: quick-011
plan: 11
type: execute
wave: 1
depends_on: [quick-008, quick-009, quick-010]
files_modified:
  - src/grounding/entities.ts
  - src/chat/allowlist.ts
  - src/chat/__tests__/allowlist.test.ts
autonomous: true

must_haves:
  truths:
    - "checkEntityAllowlist() now applies a two-tier name check: Tier 1 strict-equality (existing CORP-02), Tier 2 case-insensitive substring fallback against the lowercased source corpus."
    - "Tier 2 lets LLM-introduced title-case variants of source-mentioned terms pass (e.g. answer 'Knowledge Base' against source 'Knowledge base')."
    - "The CORP-02 fabricated-name guard is preserved — names absent from the source in any casing still fail both tiers."
    - "KB IDs and URLs stay case-sensitive — KB IDs are uppercase by regex, URLs are case-significant per RFC 3986."
    - "All 773 pre-existing tests pass. +7 new tests for Tier 2 behaviour and the security invariant. Total 780."
  artifacts:
    - path: "src/grounding/entities.ts"
      provides: "SOURCE_CORPUS_LOWERCASE — concatenated source bodies, lowercased once at module load"
      contains: "SOURCE_CORPUS_LOWERCASE"
    - path: "src/chat/allowlist.ts"
      provides: "two-tier name check (strict equality → case-insensitive substring fallback)"
      contains: "SOURCE_CORPUS_LOWERCASE.includes"
  key_links:
    - from: "src/chat/allowlist.ts checkEntityAllowlist"
      to: "src/grounding/entities.ts SOURCE_CORPUS_LOWERCASE"
      via: "Tier 2 fallback after strict match fails"
      pattern: "SOURCE_CORPUS_LOWERCASE\\.includes"
---

<objective>
Reduce false-positive `allowlist_violation` failures in `/api/chat`. Live
Phase B data on prod (`D:\kbroles` + LLM_PROVIDER=anthropic +
ANTHROPIC_MODEL=eu.anthropic.claude-opus-4-6-v1) showed Opus 4.6 + strict-
tools achieves 0/14 `quote_not_in_body` failures (citation paraphrase
fully solved) but 7/14 `allowlist_violation` failures, all on `class: names`
with `token_count: 1-3`. Net 50% pass rate, with the allowlist as the sole
bottleneck.

## Root cause

The `NAME_RE` regex requires BOTH words title-cased to match. Source
bodies frequently use sentence-case ("Knowledge base", "Subject matter
expert") for ServiceNow field names, so the lowercase-second-word
variants are never extracted into `ENTITY_ALLOWLIST.names` at module
load. When the LLM writes the natural title-case form
("Knowledge Base", "Subject Matter"), the answer-side regex DOES capture
the bigram, but the strict-equality check in checkEntityAllowlist()
rejects it as fabricated even though the referent is in-source.

## Why this didn't surface with gpt-4o

gpt-4o produced shorter answers (~150 completion tokens) using mostly
the exact casing from the source. Opus 4.6 produces longer answers
(~300-500 completion tokens) with more natural English title-case
formatting, exposing the regex/source-casing mismatch.

## Fix

Two-tier check in `checkEntityAllowlist()`:

  Tier 1 — strict-equality match against `ENTITY_ALLOWLIST.names`
    (existing behaviour, preserved). Real approver names extracted from
    KB bodies match here directly.

  Tier 2 — case-insensitive substring match against a precomputed
    lowercased source corpus. The answer-side title-case bigram is
    lowercased and looked up via `.includes()`. If it appears anywhere
    in any source body (in any casing), the name passes.

Security invariant preserved: a fabricated name like "Jane Doe" or
"Acme Corporation" doesn't appear in any source body in any casing, so
both tiers fail and the response triggers fallback. CORP-02 protection
intact.

## Performance

- One-time cost at module load: build the corpus string and lowercase it.
  Corpus is ~10K chars across three SOP sources → negligible.
- Per-check cost: `.toLowerCase()` on each extracted name + `.includes()`
  substring search on ~10K chars. O(answer-name-count × corpus-length).
  For typical 1-5 names per answer, this is ~50K char comparisons per
  request — submillisecond, no observable latency impact.

## Expected impact

Phase B production data: 7/7 allowlist_violation failures should become
passes. Combined with the existing pass rate, this projects to ~85%+
on the Author chip suite. Quote-paraphrase failures stay at 0 (Opus 4.6
already solves that).

Output: A single feat commit on master + a docs commit for STATE.md.
</objective>

<context>
@.planning/STATE.md
@.planning/quick/008-anthropic-provider-integration/008-SUMMARY.md
@.planning/quick/009-anthropic-strict-tools-mode/009-SUMMARY.md
@.planning/quick/010-fix-anthropic-url-messages-suffix/010-SUMMARY.md
@src/chat/allowlist.ts
@src/grounding/entities.ts
</context>

<discovery_findings>

## Key facts verified before planning

1. **Failure pattern in Phase B prod data** (14 chips fired against
   Opus 4.6 + strict-tools):
   - 0 × quote_not_in_body
   - 7 × allowlist_violation (all class:names, token_count 1-3)
   - 7 × success
   The 100% concentration of failures on one class with low token counts
   matches the "casing drift on source-mentioned terms" hypothesis.

2. **Corpus inspection** (`grep -oiE "knowledge base|subject matter|..." src/grounding/sources/*.md`):
   confirms that source bodies use sentence-case for many ServiceNow
   field names — "Knowledge base", "Subject matter expert",
   "Resolution field" all appear lowercase-second-word in some places.
   NAME_RE doesn't extract these, but the LLM's natural title-case
   re-mention does match NAME_RE on the answer side.

3. **NAME_RE matching behaviour** (verified by manual trace):
   `/\b([A-Z][a-z]+(?:-[A-Z][a-z]+)?\s+[A-Z][a-z]+(?:-[A-Z][a-z]+)?)\b/g`
   matches the leftmost title-case bigram and advances `lastIndex` past
   it. In `"The Subject Matter expert"`, only "The Subject" is captured
   (not "Subject Matter") because the regex starts matching from
   position 0. This affects test phrasing — tests must isolate the
   specific bigram being verified.

4. **SOURCE_CORPUS_LOWERCASE memory cost**: bodies.join('\n') across
   3 KB sources + servicenow-form is roughly 10K characters. Storing the
   lowercased copy as a module-level string is negligible footprint
   (~10KB).

</discovery_findings>

<tasks>

<task type="auto">
  <name>Task 1: Add SOURCE_CORPUS_LOWERCASE to entities.ts</name>
  <files>
    src/grounding/entities.ts
  </files>
  <action>
    Add a new exported constant `SOURCE_CORPUS_LOWERCASE: string` built
    at module load by iterating REGISTRY, concatenating section bodies
    joined by '\n', and lowercasing the result. Place it after the
    existing ENTITY_ALLOWLIST export so the ordering reflects "raw
    extraction → derived case-insensitive view."

    JSDoc explains: why this exists, what it's for, the security
    invariant it preserves, and the cost analysis.
  </action>
  <verify>
    pnpm typecheck — clean.
    Direct inspection: new export visible, type is `string`.
  </verify>
  <done>
    SOURCE_CORPUS_LOWERCASE constant available for import.
  </done>
</task>

<task type="auto">
  <name>Task 2: Two-tier check in allowlist.ts</name>
  <files>
    src/chat/allowlist.ts
  </files>
  <action>
    1. Update import to pull in SOURCE_CORPUS_LOWERCASE.

    2. Modify the names filter to do two-tier matching:
       - Tier 1: ENTITY_ALLOWLIST.names.has(n) (existing strict match)
       - Tier 2: SOURCE_CORPUS_LOWERCASE.includes(n.toLowerCase())

    3. Inline comment documenting the rationale + invariant preservation.

    KB ID and URL checks stay unchanged (case-sensitive matching).
  </action>
  <verify>
    pnpm typecheck — clean.
    Existing allowlist tests still pass.
  </verify>
  <done>
    checkEntityAllowlist() now uses two-tier name matching with
    fallback to corpus substring search.
  </done>
</task>

<task type="auto">
  <name>Task 3: Tests for Tier 2 behaviour + invariant preservation</name>
  <files>
    src/chat/__tests__/allowlist.test.ts
  </files>
  <action>
    Add a new describe block `'Quick 011 — Tier 2 case-insensitive substring fallback'`
    with 7 new tests:
      - 4 passes: title-case variants of source-mentioned terms
        (Knowledge Base, Subject Matter, Resolution Field,
        Configuration Item — last is Tier 1 anyway, included as
        non-destructive regression check)
      - 2 fails: fabricated names ("Acme Corporation", "Jane Doe")
        that don't appear in any source body
      - 1 mixed: counts only the truly-fabricated names when a
        message has both Tier-2-pass and fabricated entities

    Tests must be phrased so NAME_RE captures the bigram under test
    cleanly — preceding-title-case-word capture would derail the
    assertion. Comments explain the phrasing constraint.

    Existing tests preserved unchanged — they happen to use terms
    that pass Tier 1 strict-equality directly, so behaviour is
    backward compatible.
  </action>
  <verify>
    pnpm test src/chat/__tests__/allowlist.test.ts — 14/14 pass
      (7 original + 7 new).
    pnpm test — 780/780 across full suite.
  </verify>
  <done>
    Allowlist behaviour locked by tests across both tiers.
  </done>
</task>

<task type="auto">
  <name>Task 4: Commit + push</name>
  <files>
    .planning/quick/011-allowlist-case-fold-substring-fallback/011-PLAN.md
    .planning/quick/011-allowlist-case-fold-substring-fallback/011-SUMMARY.md
    .planning/STATE.md
  </files>
  <action>
    Standard GSD quick task closeout — atomic feat commit + docs commit.

    Commit subject:
      feat(allowlist): two-tier name check with case-insensitive corpus fallback

    Co-Author trailer: Claude Opus 4.7 (1M context).
  </action>
  <verify>
    git log -2 — both commits present.
    git push origin master — succeeds.
  </verify>
  <done>
    Commits live on origin/master, STATE.md updated.
  </done>
</task>

</tasks>

<success_criteria>
- [x] SOURCE_CORPUS_LOWERCASE constant exported from entities.ts
- [x] Two-tier name check in allowlist.ts
- [x] 7 new tests covering Tier 2 behaviour + invariant preservation
- [x] 780/780 tests pass
- [x] Typecheck clean
- [x] Commit subject: feat(allowlist): two-tier name check with case-insensitive corpus fallback
- [x] Co-Authored-By trailer: Claude Opus 4.7 (1M context)
</success_criteria>

<output>
After completion, create .planning/quick/011-allowlist-case-fold-substring-fallback/011-SUMMARY.md.
</output>
