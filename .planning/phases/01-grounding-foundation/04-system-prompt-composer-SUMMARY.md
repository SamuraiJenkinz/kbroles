---
phase: 01-grounding-foundation
plan: 04
subsystem: grounding
tags: [system-prompt, role-aware, snapshot-test, vitest, xml-sources, citation-contract, prompt-injection]

# Dependency graph
requires:
  - phase: 01-01-scaffold-registry-schema
    provides: REGISTRY, Source, Section, Registry, SourceId, KbResponse, Citation types
  - phase: 01-02-citation-validator
    provides: FALLBACK_STRING constant (single source of truth)
provides:
  - composeSystemPrompt(role) — pure function assembling 5-layer role-aware system prompt
  - renderSources(registry) — helper emitting the <sources>...</sources> XML block with anchors intact
  - Role type ('consumer' | 'author') exported from both rolePreludes.ts and systemPrompt.ts
  - ROLE_PRELUDES, COMMON_RULES_HEADER, COMMON_RULES_FOOTER, CITATION_CONTRACT_BLOCK, FEW_SHOTS — independently importable
  - Snapshot files committed for consumer and author prompts (regression gate for prompt edits)
affects:
  - 01-05-phase0-smoke (smoke script consumes composeSystemPrompt to exercise end-to-end LLM call)
  - 02-api-chat-route (route handler calls composeSystemPrompt(role) per request)
  - 03-role-select-ui (Role type union is the canonical enum)
  - 06-eval-suite (snapshots lock prompt content; any drift forces intentional review)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Layered named constants (not monolithic template) — 5 independently importable exports"
    - "Snapshot per role locks prompt wording; every edit is an intentional reviewed commit"
    - "Injection resistance by XML framing: user input wrapped in <user>...</user> tags, system rules state this explicitly"
    - "Common rules bookended (header + footer) per PITFALLS #7 'repeat at top and bottom'"
    - "Few-shot quote values asserted verbatim against registry section bodies at unit-test time (defence in depth before Phase 6 evals)"
    - "Pure composeSystemPrompt: no side effects, deterministic, calling twice returns identical string"

key-files:
  created:
    - src/grounding/systemPrompt.ts
    - src/grounding/rolePreludes.ts
    - src/grounding/commonRules.ts
    - src/grounding/fewShots.ts
    - src/grounding/__tests__/systemPrompt.test.ts
    - src/grounding/__tests__/__snapshots__/systemPrompt.test.ts.snap
  modified: []

key-decisions:
  - "Few-shot quote values adjusted at implementation time to match verbatim source text — consumer quote includes markdown ** bold markers (validator only normalises whitespace); author quote uses 'OPCO or Line of Business' (full form as written in kb0020882.md) instead of the plan's placeholder 'OPCO or LoB'"
  - "Added in-test verification that FEW_SHOTS quotes are verbatim substrings of REGISTRY section bodies — catches drift at unit-test time before Phase 6 eval fixtures"
  - "Task 4.0 no-op: src/grounding/fallback.ts already existed from Plan 02's Wave 2 commit (1e39e40); race was resolved cleanly with no duplicate file creation"
  - "Ordering-assertion anchor adjusted from `<sources>` (bare string, also appears in header prose) to `<sources>\\n<source id=` (unambiguous start of the actual block) to avoid false-negative in layer-ordering test"
  - "Per-task atomic commits (5 commits: 1 no-op for 4.0 task + 4 feat/test commits) rather than a single combined commit — consistent with Plan 01/02/03 precedent"

patterns-established:
  - "System-prompt layering: every system prompt assembled as ROLE_PRELUDES[role] + COMMON_RULES_HEADER + renderSources(REGISTRY) + FEW_SHOTS[role] + COMMON_RULES_FOOTER, joined with \\n\\n"
  - "Prompt injection resistance: user messages wrapped in <user>...</user> tags; system prompt instructs model to treat that content as question-only, never instruction"
  - "Prompt edits carry snapshot-diff cost: any edit to constants/composer triggers snapshot mismatch, forcing intentional commit with `pnpm test -u`"

# Metrics
duration: 4 min
completed: 2026-04-22
---

# Phase 1 Plan 04: System Prompt Composer Summary

**Role-aware composeSystemPrompt(role) built from 5 layered named constants (preludes, common rules header, XML-tagged sources, per-role few-shots, footer reiteration) with snapshot tests per role plus 12 structural invariants covering citation-contract presence, injection-resistance clause, FALLBACK_STRING, all three source IDs, section anchors, example count, role differentiation, layer ordering, and pure-function determinism.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-22T17:16:09Z
- **Completed:** 2026-04-22T17:20:26Z
- **Tasks:** 6 (4.0 fallback guard, 4.1 common rules, 4.2 role preludes, 4.3 few-shots, 4.4 composer + renderSources, 4.5 tests + snapshots, 4.6 full-suite verify)
- **Files created:** 6 (4 source, 1 test, 1 snapshot)
- **Files modified:** 0

## Accomplishments

- `composeSystemPrompt(role)` is a pure function exported from `@/grounding/systemPrompt`. It assembles five layered constants with `\n\n` between them: role prelude, common rules header (with `<citation_contract>` block and `<user>...</user>` injection-resistance clause), `<sources>` XML block rendered from REGISTRY with all `<!-- section:ID -->` anchors preserved, two few-shot examples per role, and common rules footer reiterating the three non-negotiable rules. GRND-05 invariant satisfied: single template, no divergent prompt trees.
- `CITATION_CONTRACT_BLOCK` exported verbatim from CONTEXT.md §3 (ARCHITECTURE.md §10) — names the three SourceId enum values and the `<!-- section:ID -->` anchor convention so the model can only cite what exists. Locked; edits require schema change + eval re-baseline.
- `COMMON_RULES_HEADER` and `COMMON_RULES_FOOTER` implement PITFALLS #7 bookending (repeat rules at top and bottom of the context). Header declares the `<user>...</user>` wrapping convention explicitly; footer re-states the three non-negotiable rules as the last thing before the user turn.
- `ROLE_PRELUDES` with `Role = 'consumer' | 'author'`. Consumer prelude tuned for Tier I analyst (concise, action-oriented, plain language); author prelude tuned for Tier II/III SME (precise, references specific SOP sections, cites numbered rubrics). Wording calibrated against handover §3 User Roles + §16 Suggested Questions.
- `FEW_SHOTS` has two examples per role: one in-scope with a valid citation whose `quote` is a verbatim substring of the real registry section body, and one out-of-scope with `can_answer: false` + `FALLBACK_STRING` + empty citations. Rendered in the prompt as `<example>\n<user>...</user>\n<assistant>\n{JSON}\n</assistant>\n</example>` blocks — the model sees both the citation-shape teaching and the fallback-shape teaching.
- `renderSources(REGISTRY)` is a pure helper exported for test visibility. Wraps each source in a single-line opening `<source id="..." title="..." version="..." url="...">` tag (mirroring the authoring convention from Plan 01), emits each section with its `<!-- section:kebab-id -->` marker, closes with `</source>`. Pitfall #19 prevention: marker format is identical across registry parser, prompt emission, and validator `section_id` check.
- 17 new tests added in `src/grounding/__tests__/systemPrompt.test.ts`: 2 snapshots (consumer, author), 10 structural invariants, 2 few-shot quote verifications (one per in-scope citation), 3 renderSources emission-shape checks. All 7 test suites across the whole project stay green: 65/65 tests pass (`pnpm test`), typecheck clean (`pnpm tsc --noEmit`).
- Snapshot files committed at `src/grounding/__tests__/__snapshots__/systemPrompt.test.ts.snap` — 715 lines, two exports (author + consumer prompts). Any edit to prompt constants, few-shot JSON, or layer order now triggers a snapshot mismatch that forces intentional `pnpm test -u` to re-baseline. That is the friction protecting the prompt.
- Phase 1 Success Criterion #1 verifiable: `pnpm test` passes snapshot tests on `composeSystemPrompt(role)` for both `consumer` and `author`, including role-specific few-shots and the citation contract block.

## Task Commits

Each task was committed atomically:

1. **Task 4.0: Ensure fallback.ts exists (Wave 2 co-ownership guard)** — no commit. File already existed (Plan 02 had committed `1e39e40` in the same wave). Task 4.0 was pure verification: `test -f src/grounding/fallback.ts` succeeded with the canonical Plan 02 content. Race resolved cleanly.
2. **Task 4.1: Common rules + citation contract block** — `d527f54` (feat)
3. **Task 4.2: Role preludes (consumer, author)** — `e07e4c1` (feat)
4. **Task 4.3: Few-shot examples per role** — `a5b8abc` (feat)
5. **Task 4.4: composeSystemPrompt + renderSources** — `97237f8` (feat)
6. **Task 4.5: Snapshot + structural tests** — `5652ede` (test)
7. **Task 4.6: Full suite green + typecheck clean** — no commit (verification-only; metadata commit captures plan closure)

**Plan metadata commit:** _(captures this SUMMARY.md + STATE.md — hash assigned at end of plan)_

## Files Created/Modified

### Created

- `src/grounding/commonRules.ts` — `CITATION_CONTRACT_BLOCK`, `COMMON_RULES_HEADER`, `COMMON_RULES_FOOTER`
- `src/grounding/rolePreludes.ts` — `Role` type, `ROLE_PRELUDES` record
- `src/grounding/fewShots.ts` — `FewShot` interface, `FEW_SHOTS` record (2 shots per role)
- `src/grounding/systemPrompt.ts` — `composeSystemPrompt(role)`, `renderSources(registry)`, `Role` re-export
- `src/grounding/__tests__/systemPrompt.test.ts` — 17 tests (2 snapshot + 10 structural + 2 few-shot verify + 3 renderSources)
- `src/grounding/__tests__/__snapshots__/systemPrompt.test.ts.snap` — 715-line committed snapshot file

### Modified

- None.

## Decisions Made

1. **Task 4.0 no-op, not duplication.** `src/grounding/fallback.ts` existed from Plan 02's Wave 2 commit `1e39e40` before this plan's executor started. Per plan guidance ("Plan 04 writes fallback.ts ONLY if it does not already exist"), Task 4.0 was satisfied by the existence check alone; no competing write, no rewrite, no commit. Contents match the spec byte-for-byte.
2. **Few-shot quote values adapted to real source text.** Plan 04's initial quote suggestions (`"Click the Flag Article button in the article header"` and `"[Application/Topic] - [Type Descriptor] - [OPCO or LoB] - [Region]"`) did not match the verbatim source text Plan 01 authored. The consumer source uses markdown bold (`**Flag Article**`); the author source spells out `OPCO or Line of Business` in full. Adjusted quotes to verbatim substrings (with the `**` markers preserved, since validator normalises whitespace only, not markdown). Phase 6 evals would have caught this; catching it here at authoring time was cheaper.
3. **Added few-shot verification tests.** On top of the snapshot + structural assertions, added a `describe('FEW_SHOTS — quote values verify against registry')` block that loops every in-scope citation and asserts the quote is a whitespace-normalised substring of the corresponding `REGISTRY[source_id].sections[section_id].body`. Defence in depth: if someone edits a source file and breaks a quote match, `pnpm test` flags it immediately rather than waiting for Phase 6 eval fixtures.
4. **Layer-ordering test uses unambiguous anchor.** The bare string `<sources>` appears twice in the prompt — once inside `COMMON_RULES_HEADER` prose (`"...bundled below inside <sources>..."`) and once as the actual opening tag of the sources block. The layer-ordering test was initially brittle against the first (prose) occurrence. Fixed by anchoring on `<sources>\n<source id=` (the real block opening) and adding an `<example>` index check for the middle of the layer sequence. Now asserts header → sources → examples → footer in strict order.
5. **Per-task atomic commits.** Followed the same 1-commit-per-task protocol used by Plans 01/02/03. Task 4.0 and Task 4.6 are verification-only with no file changes — no empty commits. Final net: 5 code/test commits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Few-shot quote values did not match real source text**

- **Found during:** Task 4.3 (authoring fewShots.ts) and Task 4.5 (writing verification tests)
- **Issue:** Plan 04's suggested few-shot quotes were authored before Plan 01 transcribed the source files. Two mismatches:
  - Consumer KB0022991/flagging-articles: plan suggested `"Click the Flag Article button in the article header"`, but the real body has `Click the **Flag Article** button in the article header.` (markdown bold markers present). Validator normalises whitespace only, so the `**` characters stay and the plan's quote is NOT a substring.
  - Author KB0020882/naming-convention: plan suggested `"[Application/Topic] - [Type Descriptor] - [OPCO or LoB] - [Region]"`, but the real body spells out `[OPCO or Line of Business]` in full.
  Had I used the plan's quotes verbatim, the in-scope few-shots would have failed validator quote checks at Phase 6 eval time, and the teaching example would have contradicted the lesson (model sees an example claiming to cite a section but the citation would flip to fallback).
- **Fix:** Adjusted both quotes at implementation time to verbatim substrings of the real section bodies:
  - Consumer: `"Click the **Flag Article** button in the article header"` (includes `**`)
  - Author: `"[Application/Topic] - [Type Descriptor] - [OPCO or Line of Business] - [Region]"`
  Documented the adjustment in the `FEW_SHOTS` JSDoc comment with an audit trail of what substrings were used.
- **Files modified:** `src/grounding/fewShots.ts`
- **Verification:** Added `describe('FEW_SHOTS — quote values verify against registry')` tests that loop every in-scope citation and assert `normalise(body).includes(normalise(quote))`. Both pass. Plan 04's own guidance explicitly called this adjustment out: "If Plan 01's source text was authored with the transcription placeholders, adapt the quote value at implementation time to a REAL substring of whatever was written in those files." So this is a planned adjustment, not a true deviation — documented here for the audit trail.
- **Committed in:** `a5b8abc` (Task 4.3 commit)

**2. [Rule 1 - Bug] Layer-ordering test produced false negative**

- **Found during:** Task 4.5 first test run
- **Issue:** The initial ordering assertion anchored on `prompt.indexOf('<sources>')`, but the bare string `<sources>` appears twice in the output — once inside `COMMON_RULES_HEADER` prose (`"...bundled below inside <sources>..."`) and once as the actual opening of the sources block. `indexOf` returned the first (prose) match at position 632, while `"Rules of engagement"` sits at position 698 — so the assertion `headerIdx < sourcesIdx` failed with `expected 698 to be less than 632`. The prompt was correctly ordered; the test's anchor was ambiguous.
- **Fix:** Replaced the bare anchor with `<sources>\n<source id=` (unambiguous — this pattern only exists at the real block opening, not in prose). Also added an `<example>` index check so the test now verifies the full layer ordering: header → sources → examples → footer in strict order.
- **Files modified:** `src/grounding/__tests__/systemPrompt.test.ts`
- **Verification:** `pnpm test` green on second run; all 65 tests pass. Snapshot file is unchanged (fix is test-only).
- **Committed in:** `5652ede` (Task 4.5 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs, both caught pre-commit before any broken state was shipped)
**Impact on plan:** Both deviations were anticipated by the plan itself (quote-verification warning + "iterate against early evals" guidance). No scope creep; each fix corrected a flaw caught during TDD-style verification. Plan 04's success criteria all met on first clean test run after fixes.

## Issues Encountered

**Concurrent STATE.md modification.** Wave 2 Plans 02 and 03 finished and updated STATE.md before Plan 04's final commit. Plan 04's executor integrates on top of the latest STATE.md (showing Plans 02 and 03 completion) rather than overwriting their work — standard Wave-2-coordination pattern. No git conflict; linear commit history preserved.

**tsx cannot execute .md-importing modules outside Vitest.** Attempted a standalone `scripts/verify-fewshot-quotes.mts` script to pre-verify quotes; tsx does not know how to load `.md` imports (no rawMarkdown Vite plugin available outside Vitest). Removed the script and moved the check into the test suite instead (it runs in Vitest where the plugin is configured). Net: verification still happens, just inside `pnpm test` rather than as a separate pre-commit script.

## User Setup Required

None — this plan is pure pattern/prompt authoring and local-only code. No external service keys, no env config, no infrastructure. `pnpm test` and `pnpm tsc --noEmit` are the entire verification surface.

## Next Phase Readiness

- **Ready for Plan 05 (phase0-smoke):** `composeSystemPrompt('consumer' | 'author')` is now importable and produces a complete, deterministic system prompt. The smoke script in Plan 05 will call this to construct the real `streamAnswer({ systemPrompt: composeSystemPrompt('author'), ... })` end-to-end test against both OpenAI and MGTI ingresses.
- **Ready for Phase 2 (Chat Backend):** `/api/chat` handler can call `composeSystemPrompt(role)` per request; role is an explicit parameter (Pitfall #4 mitigation) and server-authoritative validation of the role param lives there (not in the composer).
- **Ready for Phase 3 (Role Select UI):** `Role` type is the canonical string-union enum; extension to a third role (e.g. `'admin'`) requires four coordinated additions (type union, prelude, few-shot pair, chip list) with TypeScript driving every call site to update.
- **Ready for Phase 6 (Eval Suite):** snapshot files lock the current prompt wording. Any adjustment to `COMMON_RULES_HEADER` / `COMMON_RULES_FOOTER` / `ROLE_PRELUDES` / `FEW_SHOTS` / layer order triggers snapshot mismatch, forcing intentional `pnpm test -u` and a reviewable diff. That is the friction protecting the grounding adherence floor once evals start running.
- **Blockers/concerns:** None introduced by this plan. The Phase-0 smoke blockers listed in STATE.md remain open — they are addressed by Plan 05. Phase 1 Success Criterion #1 is now met; #2 met by Plan 02; #3/#4 depend on Plan 05 smoke evidence; #5 met by Plan 01.

---
*Phase: 01-grounding-foundation*
*Completed: 2026-04-22*
