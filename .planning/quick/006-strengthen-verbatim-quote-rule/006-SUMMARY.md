---
quick: 006
title: Strengthen verbatim-quote rule in COMMON_RULES_FOOTER
date: 2026-05-02
commit: TBD
subsystem: grounding
tags: [grounding, prompt, validator, citation, paraphrase, gpt-4o]

dependency-graph:
  requires: [quick-004, quick-005]
  provides: +30pp pass-rate on Author "form fields" chip via stronger anti-paraphrase wording
  affects: []

tech-stack:
  added: []
  patterns:
    - "name the validator's exact behavior in the prompt rule so the model can reason about consequences"
    - "give the model an escape hatch ('copy fewer words rather than rewording') when no long exact substring exists"

key-files:
  created: []
  modified:
    - src/grounding/commonRules.ts
    - src/grounding/__tests__/__snapshots__/systemPrompt.test.ts.snap

decisions:
  - id: footer-not-citation-contract
    choice: "Strengthen COMMON_RULES_FOOTER, not CITATION_CONTRACT_BLOCK"
    rationale: "CITATION_CONTRACT_BLOCK has an explicit lock comment requiring 'a corresponding schema change AND an eval re-baseline' to edit. Footer is the appropriate layer for prompt-discipline iteration."
    alternatives: []

  - id: temperature-not-changed
    choice: "Leave temperature at OpenAI default (1.0); do not set explicitly"
    rationale: "Temperature=0 was tested in a separate iteration. It collapsed paraphrase to 0% but introduced a 100% allowlist-violation failure rate (deterministic answer text consistently used title-case 'Knowledge Base' which is not in the regex-extracted entity allowlist). Net 0/10 pass. Not viable."
    alternatives: ["temperature=0.1 or 0.3 — not tested; could be a future iteration if wording-only proves insufficient"]

  - id: no-corrective-fewshot
    choice: "Do NOT add a corrective few-shot showing paraphrase getting stripped"
    rationale: "Bigger semantic change than wording-only — would alter the model's prior over more behaviors than just verbatim discipline. Wording change provides a clear bisect target if regression appears."
    alternatives: ["add a third few-shot per role demonstrating wrong-quote-stripped → fallback — defer to a future iteration if needed"]

metrics:
  duration: "~10 minutes (after diagnostic investigation completed)"
  completed: 2026-05-02
  benchmark:
    chip: "What fields do I need to fill in on the form? (Author role)"
    model: "gpt-4o-2024-08-06 (direct OpenAI, local dev)"
    trials: 10
    baseline_unmodified:
      pass: 4
      quote_not_in_body: 5
      allowlist_violation: 1
    with_strengthened_rule:
      pass: 7
      quote_not_in_body: 1
      allowlist_violation: 2
    improvement_pp: 30
---

# Quick Task 006: Strengthen verbatim-quote rule in COMMON_RULES_FOOTER

**One-liner:** Footer rule 1 in `commonRules.ts` rewritten to explicitly forbid paraphrase/summary/rewording/punctuation-normalisation, name the validator's exact-substring check, and give the model an escape hatch ("copy fewer words rather than rewording"). Local 10-trial benchmark on the failing Author chip shows +30pp pass-rate improvement.

## Commit

| Field | Value |
|-------|-------|
| Hash | TBD |
| Subject | `feat(grounding): strengthen verbatim-quote rule in COMMON_RULES_FOOTER` |
| Branch | `master` |
| Co-Author | `Claude Opus 4.7 (1M context) <noreply@anthropic.com>` |

## The Change

`src/grounding/commonRules.ts`, footer rule 1.

**Before:**

```
1. Cite exactly one (source_id, section_id, quote) per response; the quote
   must appear verbatim inside the cited section.
```

**After:**

```
1. Cite exactly one (source_id, section_id, quote) per response. The quote
   MUST be a character-for-character substring copied directly from the
   cited section body — do NOT paraphrase, summarise, reword, or normalise
   punctuation. If you cannot find a short exact substring that supports
   the answer, copy fewer words rather than rewording. The validator strips
   any quote that is not a verbatim substring, which triggers the fallback.
```

Snapshot regenerated for both consumer and author roles in
`src/grounding/__tests__/__snapshots__/systemPrompt.test.ts.snap`.

## Diagnostic Story (How We Got Here)

1. **STATE.md open loop** from Quick 004: failing Author chip "What fields
   do I need to fill in on the form?" lands on `all_citations_stripped`
   fallback in production. Operator sees "Outside my knowledge".

2. **Initial small-N sample** (3 tsx + 4 HTTP runs): 1 fallback observed,
   suggested ~14% failure rate. Hypothesis: environmental drift (MGTI
   gpt-4o snapshot vs direct OpenAI gpt-4o).

3. **Quick 005** unblocked local HTTP repro by fixing `pnpm dev`.

4. **10-trial benchmark of unmodified baseline** corrected the diagnosis:
   - 4/10 pass
   - 5/10 quote_not_in_body strips (50%)
   - 1/10 allowlist violation (10%)
   - **Real failure rate is ~60%, not 14%.** Initial sample was lucky.
   - **Failure mode is paraphrase**, not source/section misidentification.

5. **Lever 1 tested — temperature=0**: Reduced paraphrase to 0% but
   introduced 100% allowlist-violation failure rate (deterministic answer
   text always used title-case "Knowledge Base" not in the source-extracted
   allowlist). Net 0/10 pass. Reverted.

6. **Lever 2 tested — strengthen footer rule 1**: 7/10 pass, 1 quote-strip,
   2 allowlist. Net +30pp pass-rate; paraphrase rate dropped 5x. Shipped.

## Confirmed Invariants

- `CITATION_CONTRACT_BLOCK` is byte-identical to before this commit
  (`git diff HEAD~1 HEAD -- src/grounding/commonRules.ts | grep CITATION_CONTRACT_BLOCK`
  returns empty).
- `COMMON_RULES_HEADER` unchanged.
- `src/grounding/fewShots.ts` unchanged.
- `src/grounding/rolePreludes.ts` unchanged.
- `src/grounding/validator.ts` unchanged.
- `src/llm/stream.ts` unchanged (temperature reverted to default).
- 733/733 unit tests pass after snapshot regen.
- Typecheck clean.

## Test Counts

| Scope | Before | After | Delta |
|-------|--------|-------|-------|
| Whole suite | 733 | 733 | 0 |

No new tests added in this commit. Adding a stochastic regression eval
("fire chip N times, assert ≥90% pass rate") is a separate Quick 008
candidate — would belong in the slow eval suite (LLM_JUDGE_API_KEY-gated).

## Deviations from Plan

None — both temperature=0 and the corrective-few-shot levers were considered
and rejected with rationale captured in `decisions:` frontmatter.

## Push Status

To be pushed by orchestrator after this commit lands.

## Follow-up

Two distinct loose threads surfaced during this investigation, both candidate
Quick tasks:

- **Quick 007 (allowlist sensitivity)** — 10-20% of citation-validated
  responses fail the entity-allowlist post-check because the model emits
  title-case proper-noun-shaped phrases ("Knowledge Base", "Subject Matter
  Expert") that the source body has in different casing ("Knowledge base").
  The regex-extracted allowlist therefore doesn't include them. Likely fix:
  case-fold names in the allowlist comparison, or constrain the prompt to
  preserve source casing for proper-noun-shaped tokens.

- **Quick 008 (stochastic regression eval)** — `citation-substring.eval.ts`
  is fixture-based (no LLM call) so it never would have caught the
  paraphrase issue. Add a "chip stability" eval that fires each chip N=20
  times against the dev model and asserts ≥90% pass rate. Belongs in slow
  suite (LLM_JUDGE_API_KEY-gated).

The original Open Diagnostic Loop from Quick 004 is now CLOSED at the local
gpt-4o level. Re-baselining against the deployed MGTI gpt-4o is operator-
blocked until the next deploy lands.
