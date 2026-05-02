---
phase: quick-006
plan: 06
type: execute
wave: 1
depends_on: [quick-004, quick-005]
files_modified:
  - src/grounding/commonRules.ts
  - src/grounding/__tests__/__snapshots__/systemPrompt.test.ts.snap
autonomous: true

must_haves:
  truths:
    - "COMMON_RULES_FOOTER rule 1 explicitly forbids paraphrase, summary, rewording, and punctuation normalisation."
    - "The strengthened rule names the failure mode (validator strips non-verbatim quotes → fallback) so the model understands the consequence."
    - "Passing rate on the failing Author chip ('What fields do I need to fill in on the form?') improves by ≥20pp at the local 10-trial benchmark vs unmodified baseline."
    - "CITATION_CONTRACT_BLOCK is NOT touched (the inline comment explicitly locks it pending schema-change + eval re-baseline)."
    - "All 733 unit tests stay green after the snapshot regen."
  artifacts:
    - path: "src/grounding/commonRules.ts"
      provides: "Strengthened verbatim-quote rule in COMMON_RULES_FOOTER (footer rule 1)."
      contains: "character-for-character substring"
    - path: "src/grounding/__tests__/__snapshots__/systemPrompt.test.ts.snap"
      provides: "Regenerated snapshot reflecting the new footer wording for both consumer and author roles."
  key_links:
    - from: "src/grounding/commonRules.ts:46-49 COMMON_RULES_FOOTER"
      to: "src/grounding/validator.ts quoteExistsInBody"
      via: "footer rule 1 names the validator's behavior so the model can reason about it"
      pattern: "character-for-character substring"
---

<objective>
Reduce the Author chip "What fields do I need to fill in on the form?" failure
rate by strengthening the verbatim-quote rule in `COMMON_RULES_FOOTER`.

## Diagnostic context

Quick 004's flip-detail telemetry, combined with the Quick 005 dev-server fix,
made it possible to capture per-citation flip details locally. A 10-trial
benchmark of the failing Author chip against unmodified `master` produced:

| Metric | Count | Rate |
|---|---|---|
| Pass | 4 | 40% |
| Fail — `quote_not_in_body` (citation strip) | 5 | 50% |
| Fail — `allowlist_violation` | 1 | 10% |

The dominant failure mode is **citation paraphrase**: the model picks the
right `source_id` (SNOW_FORM) AND right `section_id` (required-fields), but
50% of the time emits a quote that is not a verbatim substring of the section
body. The validator at `src/grounding/validator.ts:36-38` does an exact
substring match (`quoteExistsInBody`) with whitespace collapse + trim only —
case-sensitive, no punctuation folding. Any paraphrase fails this check.

The current footer rule 1 mentions verbatim once at the end of a sentence
about citation count — the model treats "verbatim" as "faithful to meaning"
rather than "exact substring."

## Levers explored before this plan

1. **Temperature=0** — tested via 10-trial benchmark. Collapsed paraphrase to
   0% but the deterministic answer text consistently included a title-case
   name token ("Knowledge Base") that's not in the regex-extracted entity
   allowlist. Net 0/10 pass. **Rejected and reverted.**
2. **Strengthen footer rule 1 with explicit anti-paraphrase wording** — tested
   via 10-trial benchmark. Improved pass rate to 7/10 (50% → 10% paraphrase
   strip; allowlist failure rate roughly unchanged at 20%). **Chosen.**
3. **Add corrective few-shot showing paraphrase getting stripped** — deferred.
   Bigger semantic change, harder to bisect. Save for a future iteration if
   wording alone proves insufficient.

## Out of scope (separate quick tasks)

- The 10-20% allowlist-violation failure mode — separate concern, deeper
  investigation needed. Surfaces as Quick 007 candidate.
- Adding a stochastic eval suite that fires each chip N times and asserts
  ≥90% pass rate — eval gap surfaced during this investigation. Quick 008
  candidate.
- Re-baselining against the deployed MGTI gpt-4o — operator-blocked until
  the next deploy.

Output: A single feat commit on master modifying only commonRules.ts and the
snapshot file.
</objective>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/quick/005-force-webpack-for-pnpm-dev/005-SUMMARY.md
@src/grounding/commonRules.ts
@src/grounding/validator.ts
@src/grounding/systemPrompt.ts
@src/grounding/fewShots.ts
@src/grounding/__tests__/__snapshots__/systemPrompt.test.ts.snap
</context>

<discovery_findings>

## Key facts verified before planning

1. **Validator does exact substring match** (`src/grounding/validator.ts:32-38`):
   ```ts
   function normalise(s: string): string {
     return s.replace(/\s+/g, ' ').trim()
   }
   function quoteExistsInBody(quote: string, body: string): boolean {
     return normalise(body).includes(normalise(quote))
   }
   ```
   Whitespace collapsed, trimmed, but **case-sensitive** with no punctuation
   folding. Comment at line 31 is explicit: "Case-sensitive, no punctuation
   folding."

2. **CITATION_CONTRACT_BLOCK is locked** (`src/grounding/commonRules.ts:1-19`):
   The block is verbatim from `01-CONTEXT.md §3` (which in turn quotes
   `research/ARCHITECTURE.md §10`). The inline comment forbids editing without
   "a corresponding schema change AND an eval re-baseline." Strengthening must
   live in `COMMON_RULES_FOOTER` instead.

3. **COMMON_RULES_FOOTER currently says**:
   ```
   1. Cite exactly one (source_id, section_id, quote) per response;
      the quote must appear verbatim inside the cited section.
   ```
   "verbatim" is mentioned but the wording is weak — a single word at the end
   of a sentence whose primary topic is citation count.

4. **Few-shots already use verbatim quotes** (`src/grounding/fewShots.ts`):
   The author and consumer few-shots both contain real verbatim substrings
   from the registry (commented as such in the file). They demonstrate
   verbatim by example but do NOT include a negative case showing what
   happens when the model paraphrases. Adding such a case would be a larger
   change — out of scope here.

5. **Snapshot tests will need regeneration**: There are two snapshot tests in
   `src/grounding/__tests__/systemPrompt.test.ts` (consumer + author) that
   capture the rendered prompt byte-for-byte. Any wording change to the footer
   invalidates both. Regenerate via `pnpm test src/grounding/__tests__/systemPrompt.test.ts -u`.

</discovery_findings>

<tasks>

<task type="auto">
  <name>Task 1: Strengthen footer rule 1 in COMMON_RULES_FOOTER</name>
  <files>
    src/grounding/commonRules.ts
    src/grounding/__tests__/__snapshots__/systemPrompt.test.ts.snap
  </files>
  <action>
    ## Step 1 — Edit `src/grounding/commonRules.ts`

    Replace footer rule 1 with strengthened wording. Current:

    ```
    1. Cite exactly one (source_id, section_id, quote) per response; the
       quote must appear verbatim inside the cited section.
    ```

    Strengthened:

    ```
    1. Cite exactly one (source_id, section_id, quote) per response. The
       quote MUST be a character-for-character substring copied directly
       from the cited section body — do NOT paraphrase, summarise, reword,
       or normalise punctuation. If you cannot find a short exact substring
       that supports the answer, copy fewer words rather than rewording.
       The validator strips any quote that is not a verbatim substring,
       which triggers the fallback.
    ```

    Rationale embedded in the wording:
    - "character-for-character substring" — unambiguous; "verbatim" alone is
      LLM-interpretable as "faithful to meaning."
    - Lists the exact failure modes (paraphrase, summarise, reword, punctuation
      normalisation) so the model can reason about each.
    - "copy fewer words rather than rewording" — gives the model an escape
      hatch when no long exact substring exists.
    - Names the validator's behavior and consequence (fallback) so the model
      understands the cost of non-compliance.

    Do NOT touch `CITATION_CONTRACT_BLOCK`, `COMMON_RULES_HEADER`, few-shots,
    role preludes, or any other layer of the system prompt.

    ## Step 2 — Regenerate snapshot

    Run:

    ```
    pnpm test src/grounding/__tests__/systemPrompt.test.ts -u
    ```

    Expect both consumer and author snapshots to update with the new footer
    wording. Open the regenerated `__snapshots__/systemPrompt.test.ts.snap`
    and confirm the only diff is in the footer rule 1 — no other layer
    should have moved.

    ## Step 3 — Verify full test suite + typecheck

    ```
    pnpm typecheck
    pnpm test
    ```

    Expected: 733/733 pass, no type errors.

    ## Step 4 — Local 10-trial benchmark (optional but recommended)

    Restart `pnpm dev` (now Webpack mode per Quick 005) and fire the failing
    chip 10 times via curl:

    ```
    for i in $(seq 1 10); do
      curl -sN -X POST http://localhost:3000/api/chat \
        -H "Content-Type: application/json" \
        -d '{"role":"author","messages":[{"role":"user","content":"What fields do I need to fill in on the form?"}]}' \
        --max-time 60 | head -c 80
      echo
      sleep 1
    done
    ```

    Tally pass / quote-strip / allowlist failures. Expected post-change:
    - quote_not_in_body strips: ≤ 20% (vs 50% baseline)
    - Net pass rate: ≥ 60% (vs 40% baseline)

    Allowlist failures may persist at ~10-20% — that's a separate concern
    (Quick 007 candidate).

    ## Step 5 — Commit

    ```
    feat(grounding): strengthen verbatim-quote rule in COMMON_RULES_FOOTER

    Footer rule 1 now explicitly forbids paraphrase, summary, rewording, and
    punctuation normalisation, names the validator's exact-substring check,
    and gives the model an escape hatch ("copy fewer words rather than
    rewording") for cases where no long exact substring exists.

    Local 10-trial benchmark on the failing Author chip "What fields do I
    need to fill in on the form?" against gpt-4o-2024-08-06:

      Baseline (unmodified):       4 pass / 5 quote-strip / 1 allowlist
      With strengthened rule:      7 pass / 1 quote-strip / 2 allowlist

    Net +30pp pass-rate improvement; quote_not_in_body rate drops 5x.
    The residual 10-20% allowlist-violation rate is a separate concern
    (candidate Quick 007 — title-case drift the model introduces vs the
    regex-extracted source allowlist).

    CITATION_CONTRACT_BLOCK is NOT touched (per its lock comment requiring
    schema change + eval re-baseline). All 733 unit tests stay green after
    snapshot regen.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```

    Push:
    ```
    git push origin master
    ```
  </action>
  <verify>
    - `pnpm typecheck` exits 0.
    - `pnpm test` shows 733/733 pass.
    - `git diff HEAD~1 HEAD -- src/grounding/commonRules.ts` shows the new
      footer rule 1 wording, no other lines changed.
    - `git diff HEAD~1 HEAD -- src/grounding/__tests__/__snapshots__/systemPrompt.test.ts.snap`
      shows the snapshot update for both roles, footer rule 1 only.
    - `git diff HEAD~1 HEAD -- src/grounding/commonRules.ts | grep -F "CITATION_CONTRACT_BLOCK"`
      returns empty (the locked block was not touched).
  </verify>
  <done>
    - Single commit on master modifying only commonRules.ts + the snapshot.
    - Local 10-trial benchmark shows pass-rate improvement of ≥20pp on the
      target chip.
    - `git push origin master` succeeded.
  </done>
</task>

</tasks>

<success_criteria>
- [x] Footer rule 1 strengthened with character-for-character + anti-paraphrase wording
- [x] CITATION_CONTRACT_BLOCK NOT touched (locked)
- [x] Snapshot regenerated for both consumer and author
- [x] 733/733 unit tests pass
- [x] Typecheck clean
- [x] Local 10-trial benchmark improvement: 4/10 → 7/10 pass (+30pp)
- [x] Commit subject: `feat(grounding): strengthen verbatim-quote rule in COMMON_RULES_FOOTER`
- [x] Co-Authored-By trailer: `Claude Opus 4.7 (1M context)`
</success_criteria>

<output>
After completion, create `.planning/quick/006-strengthen-verbatim-quote-rule/006-SUMMARY.md`.
</output>
