---
phase: quick-012
plan: 12
type: execute
wave: 1
depends_on: [quick-009, quick-011]
files_modified:
  - src/chat/allowlist.ts
  - src/chat/__tests__/allowlist.test.ts
  - src/prompts/suggested.ts
autonomous: true

must_haves:
  truths:
    - "checkEntityAllowlist() adds a Tier 3 word-subset fallback: after Tier 1 strict equality and Tier 2 substring miss, split the bigram on whitespace and check that every constituent word appears as a substring of the lowercased corpus."
    - "Chip auth-02 reworded from 'article structure' to 'article body format' (source-aligned vocabulary) to reduce paraphrase-driven failures even before Tier 3 fires."
    - "Both layers are belt-and-suspenders: chip rewrite lowers the rate at which Claude constructs problematic bigrams; Tier 3 catches the residual."
    - "CORP-02 fabricated-name guard preserved: names like 'Jane Doe' or 'Acme Corporation' still fail because at least one constituent word ('jane', 'acme') is absent from the entire corpus."
    - "All 780 pre-existing tests still pass. +4 new tests for Tier 3 (2 pass cases, 2 invariant-preservation fails). Total 784."
  artifacts:
    - path: "src/chat/allowlist.ts"
      provides: "Tier 3 word-subset fallback after Tier 2 misses"
      contains: "words.every(w => SOURCE_CORPUS_LOWERCASE.includes(w))"
    - path: "src/prompts/suggested.ts"
      provides: "Reworded auth-02 chip text aligned with source vocabulary"
      contains: "article body format"
  key_links:
    - from: "src/chat/allowlist.ts Tier 3 logic"
      to: "src/grounding/entities.ts SOURCE_CORPUS_LOWERCASE (shared with Quick 011 Tier 2)"
      via: "constituent-word substring lookups via .includes() per word"
      pattern: "split\\(/\\\\s\\+/\\)"
    - from: "src/prompts/suggested.ts auth-02"
      to: "source vocabulary in src/grounding/sources/servicenow-form.md"
      via: "rewording 'article structure' → 'article body format' matches the source's 'Article Body' / 'article body' phrasings"
      pattern: "article body format"
---

<objective>
Close the residual 30% failure rate on chip `auth-02` ("What's the naming
convention and article structure?") observed in Phase B production data
after Quick 011 shipped. Failures concentrate on this single chip — all
`allowlist_violation` with `class: names` and `token_count: 1`. Diagnosis
(per source-corpus grep + Quick 011 trace): Claude is constructing the
title-case bigram `"Article Structure"` in its answer, echoing the chip's
own wording. The phrase doesn't appear in source in any casing — source
uses `"Article Body"` for the same concept. Quick 011's Tier 2 substring
fallback can't help because there's no substring to match against.

## Two parallel fixes

### 1. Chip rewrite (auth-02)

Update the chip text from `"What's the naming convention and article structure?"`
to `"What's the naming convention and article body format?"`. "Article body"
appears verbatim in `servicenow-form.md` ("## Article Body Field" section
heading plus prose-text mentions). Claude no longer has incentive to invent
the title-case `"Article Structure"` bigram because the source-aligned
phrasing is right there in the question.

This reduces the rate at which the model constructs problematic bigrams in
the first place — prevention over recovery. The chip header comment notes
the handover doc (info/KB_Assistant_ClaudeCode_Handover.md §16) is the
upstream source of truth; this Quick task updates the deployment-facing
file, with an inline comment flagging that the handover should be updated
to match.

### 2. Allowlist Tier 3 (word-subset)

Add a third tier to `checkEntityAllowlist()` so that even when the model
constructs a new title-case bigram from source vocabulary (regardless of
whether the chip text was rewritten), the answer doesn't fall back.

After Tier 1 (strict equality) and Tier 2 (case-insensitive substring) both
miss, Tier 3 splits the bigram on whitespace and checks that EVERY
constituent word appears as a substring somewhere in the lowercased corpus.

The two layers are independent: the chip rewrite reduces the FREQUENCY of
the failure pattern; Tier 3 catches any residual instances where Claude
still constructs a non-source bigram (e.g. future chips, or freeform user
input).

## Trade-off

Tier 3 is more permissive than Tier 2. A fabricated phrase where BOTH words
happen to appear in source as substrings would pass — e.g. `"Server Room"`
where both `"server"` and `"room"` might appear in unrelated contexts. The
threat model has shifted enough since CORP-02 was authored that this is
acceptable:

  - Quick 009's strict-tools enforcement guarantees schema correctness at
    the API level — the JSON shape is no longer a vector for fabrication.
  - The validator enforces verbatim citation quotes — answer prose is
    already grounded through a separate mechanism.
  - The allowlist is the FINAL belt-and-suspenders check, not the primary
    enforcement layer.

The .every() short-circuit preserves the CORP-02 invariant for the
specific names in the threat-model fixtures: `"Jane Doe"` fails because
`"jane"` is genuinely outside the corpus; `"Acme Corporation"` fails
because `"acme"` is absent.

## Out of scope

- Updating the handover doc (info/KB_Assistant_ClaudeCode_Handover.md §16)
  to reflect the chip text change — it's an untracked file, operator-local,
  flagged in the chip's inline comment but not auto-edited here.
- Adding `chip_id` wiring on the client side so chip_vs_freeform telemetry
  correctly tags chip-driven requests as `"chip"` (still arrives as
  `"freeform"` because chip_id isn't sent — deferred from Phase 3).

Output: A single feat commit on master + a docs commit for STATE.md.
</objective>

<context>
@.planning/STATE.md
@.planning/quick/011-allowlist-case-fold-substring-fallback/011-SUMMARY.md
@src/chat/allowlist.ts
@src/prompts/suggested.ts
@src/grounding/entities.ts
</context>

<discovery_findings>

## Key facts verified before planning

1. **The failing question is chip auth-02** (operator confirmation in
   conversation). Original text: `"What's the naming convention and article
   structure?"`. Located in `src/prompts/suggested.ts:65-67`.

2. **Phase B logs after Quick 011** showed 3/10 failures, all on
   `question_hash: 676ca81e36b850ae` (chip auth-02). All
   `allowlist_violation` with `class: names`, `token_count: 1`. The "1"
   is critical — exactly one unrecognised bigram per response.

3. **Source corpus grep** confirmed:
   - `"article structure"` — does NOT appear in any source in any casing.
   - `"Article Body"` — appears in `servicenow-form.md` as the section
     heading "## Article Body Field" + prose mentions.
   - `"article body"` lowercase — appears in `servicenow-form.md`.
   - `"structure"` standalone — appears in `kb0020882.md` (once).
   - `"format"` — appears in all three sources in multiple casings.

4. **Tier 3 word-presence check uses substring, not exact word match.**
   Source text contains compound words like `"ServiceNow"`, `"markdown"`
   — substring matching `"service"` / `"now"` against `"servicenow"` is
   intentional. This handles the related "compound word split" failure
   pattern (e.g. if Claude writes `"Service Now"` with a space).

5. **The chip test (src/app/api/prompts/__tests__/route.test.ts:126)
   asserts only chip IDs**, not text. Safe to rewrite text without
   breaking tests.

6. **Handover doc** (`info/KB_Assistant_ClaudeCode_Handover.md §16`) is the
   documented source-of-truth for chip text per the file header. Per
   git status, `info/` is untracked — operator-local docs not committed.
   The chip header comment now flags that the handover should be updated
   to match this rewording.

</discovery_findings>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite auth-02 chip text</name>
  <files>
    src/prompts/suggested.ts
  </files>
  <action>
    Change auth-02 `label` + `text` from `"What's the naming convention and
    article structure?"` to `"What's the naming convention and article body
    format?"`. Add an inline comment explaining the rewording rationale
    (source vocabulary alignment, Quick 012 reference) and flagging that
    the handover doc upstream should be updated to match.
  </action>
  <verify>
    pnpm typecheck — clean.
    pnpm test src/app/api/prompts/__tests__/route.test.ts — chip-ID
      assertions still pass (the route test doesn't check text content).
  </verify>
  <done>
    auth-02 chip ships with source-aligned wording.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Tier 3 word-subset to checkEntityAllowlist</name>
  <files>
    src/chat/allowlist.ts
  </files>
  <action>
    After the Tier 2 check, insert Tier 3:

      const words = n.toLowerCase().split(/\s+/)
      if (words.every(w => SOURCE_CORPUS_LOWERCASE.includes(w))) return false

    Inline comment block documenting:
      - The fallback logic
      - The trade-off (looser than Tier 2; relies on schema-correctness +
        validator-substring guarantees from upstream layers)
      - The CORP-02 invariant preservation via .every() short-circuit

    No other changes to allowlist.ts.
  </action>
  <verify>
    pnpm typecheck — clean.
    Existing 14 allowlist tests still pass.
  </verify>
  <done>
    Tier 3 active; Tier 1 and Tier 2 behaviour unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 3: Tests for Tier 3</name>
  <files>
    src/chat/__tests__/allowlist.test.ts
  </files>
  <action>
    Add a new describe block `'Quick 012 — Tier 3 word-subset fallback'`
    with 4 tests:
      1. "Article Structure" passes (the chip auth-02 production failure
         pattern — both "article" and "structure" in source separately)
      2. "Service Now" passes (compound-word split — both halves are
         substrings of "ServiceNow")
      3. "Jane Doe" still fails (CORP-02 invariant — "jane" is genuinely
         absent from corpus)
      4. "Acme Corporation" still fails ("acme" is genuinely absent)
  </action>
  <verify>
    pnpm test src/chat/__tests__/allowlist.test.ts — 18/18 pass.
    pnpm test — 784/784 across full suite.
  </verify>
  <done>
    Tier 3 behaviour locked by tests, CORP-02 invariant explicitly
    re-asserted.
  </done>
</task>

<task type="auto">
  <name>Task 4: Commit + push</name>
  <files>
    .planning/quick/012-allowlist-word-subset-and-chip-realignment/012-PLAN.md
    .planning/quick/012-allowlist-word-subset-and-chip-realignment/012-SUMMARY.md
    .planning/STATE.md
  </files>
  <action>
    Standard GSD quick task closeout — atomic feat commit + docs commit.

    Commit subject:
      feat(allowlist+chip): Tier 3 word-subset fallback + auth-02 chip realignment

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
- [x] auth-02 chip text reworded to use "article body format"
- [x] Tier 3 word-subset fallback in checkEntityAllowlist
- [x] 4 new tests covering Tier 3 cases + invariant preservation
- [x] 784/784 tests pass
- [x] Typecheck clean
- [x] Commit subject: feat(allowlist+chip): Tier 3 word-subset fallback + auth-02 chip realignment
- [x] Co-Authored-By trailer: Claude Opus 4.7 (1M context)
</success_criteria>

<output>
After completion, create 012-SUMMARY.md.
</output>
