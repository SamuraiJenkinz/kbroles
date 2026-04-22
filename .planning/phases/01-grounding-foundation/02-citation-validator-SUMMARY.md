---
phase: 01-grounding-foundation
plan: 02
subsystem: grounding
tags: [typescript, vitest, pnpm, pure-function, citation-validation, fallback, grnd-03, grnd-04]

# Dependency graph
requires:
  - phase: 01-grounding-foundation/01
    provides: "REGISTRY loader, Source/Section/Registry types, CITATION_SCHEMA + KbResponse/Citation/SourceId types"
provides:
  - validateCitations(response, registry) — pure deterministic citation validator with whitespace-normalised substring check, source_id/section_id verification, total-strip fallback flip, and GRND-04 enforcement
  - FALLBACK_STRING — single-source-of-truth constant for handover §15 out-of-scope fallback copy
  - FallbackFlip / FlipReason / ValidationResult types for diagnostic _flips array consumed by Phase 2 structured logging
affects: [01-04-system-prompt-composer, 01-05-phase0-smoke, 02-api-chat-route, 02-entity-post-check, 03-chat-ui-fallback-rendering, 04-source-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parameter-injected registry (RESEARCH.md Gap 1) — validator takes Registry as argument rather than importing the singleton, enabling isolated test fixtures"
    - "Whitespace-normalised substring quote match (collapse \\s+ to single space + trim, case-sensitive, no punctuation folding) — balances line-wrap tolerance against paraphrase resistance"
    - "Diagnostic _flips array with underscore prefix — signals non-wire / non-LLM-contract field for Phase 2 server logging"
    - "Single-source-of-truth fallback constant in its own module — validator + system prompt + chat UI all import from @/grounding/fallback"
    - "Four-rule validator contract locked in CONTEXT.md §2: pass-through / strip / fallback-flip / GRND-04 trim"

key-files:
  created:
    - src/grounding/fallback.ts
    - src/grounding/validator.ts
    - src/grounding/__tests__/validator.test.ts
  modified: []

key-decisions:
  - "can_answer=false is NOT a flip — validator preserves answer and can_answer unchanged, only defensively zeroes citations (CONTEXT.md §2 schema contract: can_answer=false => citations=[])"
  - "Empty citations with can_answer=true is treated as total-strip (fallback flip), not as a pass-through — an LLM that claims to answer but provides zero citations is indistinguishable from one whose citations were all stripped"
  - "Quote match is case-sensitive by design — capitalisation drift signals the model is quoting from memory rather than from the loaded text (pitfall watch in PLAN §pitfall_watch)"
  - "findSourceForId uses a guarded Record<string, Source | undefined> lookup rather than narrowing cite.source_id to SourceId — the LLM response is untrusted input; unknown source_ids must hit the unknown_source_id flip path, not a TypeScript assertion"
  - "Per-task atomic commits (3 feat+test commits plus 1 metadata docs commit) rather than the single combined commit suggested in PLAN Task 2.4 — same pattern Plan 01 established"

patterns-established:
  - "Pure validator contract: (KbResponse, Registry) => ValidationResult — no I/O, no logging (logging is the caller's job in Phase 2), fully deterministic"
  - "FlipReason discriminated union: 'unknown_source_id' | 'unknown_section_id' | 'quote_not_in_body' | 'trimmed_excess_citation' — extensible enum for Phase 2 telemetry categorisation"
  - "Inline fixture registries in tests (not REGISTRY import) — decouples validator unit tests from any future registry content drift"

# Metrics
duration: 2 min
completed: 2026-04-22
---

# Phase 1 Plan 02: Citation Validator Summary

**Deterministic quote-substring citation validator (`validateCitations(response, registry)`) — strips unknown source/section IDs, rejects fabricated quotes via whitespace-normalised case-sensitive substring match, flips to `FALLBACK_STRING` on total strip, enforces GRND-04 (≤1 citation), and records every strip on a diagnostic `_flips` array for Phase 2 logging. 12 test cases, 35/35 suite green, pnpm tsc --noEmit clean.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-22T17:14:48Z
- **Completed:** 2026-04-22T17:16:57Z
- **Tasks:** 4 (2.1 fallback constant, 2.2 validator, 2.3 tests, 2.4 full-suite verification)
- **Files created:** 3
- **Files modified:** 0

## Accomplishments

- `FALLBACK_STRING` constant exported from `@/grounding/fallback` — single source of truth for handover §15 out-of-scope copy, consumed by validator today and by system prompt + chat UI in downstream plans.
- `validateCitations(response, registry)` pure function exported from `@/grounding/validator` — pass-through when `can_answer=false`, strip-then-flip contract when all citations fail, GRND-04 trim when >1 survives. No I/O, no network, no filesystem.
- `ValidationResult extends KbResponse` with a `_flips: FallbackFlip[]` diagnostic array; `FallbackFlip` exposes `{ source_id, section_id, reason: FlipReason }` where `FlipReason` is `'unknown_source_id' | 'unknown_section_id' | 'quote_not_in_body' | 'trimmed_excess_citation'`.
- Quote-substring check uses whitespace normalisation only — collapses runs of whitespace to a single space on both sides, trims, case-sensitive, no punctuation or unicode folding. Locks the contract in CONTEXT.md §2.
- 12 Vitest test cases with an inline FIXTURE registry (not the real REGISTRY) — pass-through (x2), good citation (x2), strip cases (x5), GRND-04 trim (x2), empty-citations-on-can-answer-true edge (x1). Deterministic across repeat runs.
- Full project test suite: 35/35 passing (schema: 4, registry: 9, entities: 10, validator: 12). No regression on Plan 01's suites. `pnpm tsc --noEmit` exits 0.
- Phase 1 Success Criterion #2 now demonstrably satisfied: "The quote-substring validator rejects a synthetic response with a fabricated quote and passes a known-good response whose quote appears verbatim in the source registry."

## Task Commits

Each task was committed atomically:

1. **Task 2.1: Define FALLBACK_STRING constant** — `1e39e40` (feat)
2. **Task 2.2: Implement validateCitations pure function** — `1a71294` (feat)
3. **Task 2.3: Exhaustive validator tests with inline fixture registry** — `a32fa32` (test)
4. **Task 2.4: Full-suite green + typecheck clean** — no commit (verification-only; metadata commit captures plan closure)

**Plan metadata commit:** _(captures this SUMMARY.md, STATE.md, and PLAN.md — hash assigned at end of plan)_

## Files Created/Modified

### Created

- `src/grounding/fallback.ts` — `FALLBACK_STRING` constant (handover §15 verbatim)
- `src/grounding/validator.ts` — `validateCitations`, `ValidationResult`, `FallbackFlip`, `FlipReason`, internal `normalise` / `quoteExistsInBody` / `findSourceForId` helpers
- `src/grounding/__tests__/validator.test.ts` — 12 test cases across 5 describe blocks, inline FIXTURE registry

### Modified

- None

## Decisions Made

1. **`can_answer=false` is NOT a flip.** CONTEXT.md §2 Rule 1 says "pass through untouched" for `can_answer=false`, meaning `answer` and `can_answer` are preserved unchanged. The only transformation the validator makes in this branch is to defensively force `citations: []` (the schema contract in CONTEXT.md §2 requires `can_answer=false => citations=[]`; if the model disobeys and sends citations alongside `can_answer=false`, they are contract violations and we never surface them). No flip event, no diagnostic entry — the validator code comment explicitly calls this out.
2. **Empty citations with `can_answer=true` is a total-strip.** The empty-citations-on-can-answer-true edge case test locks this behaviour: the validator treats `citations: []` entering the loop identically to "all citations stripped" — both produce `survivors.length === 0` after the loop, which triggers the fallback flip. Rationale: an LLM that claims to answer but provides zero citations is indistinguishable from one whose citations were all stripped, and neither outcome is safe to surface to the user.
3. **Case-sensitive quote match.** The test `strips a citation whose quote differs only by capitalisation (case-sensitive)` asserts this intentionally. Capitalisation drift is a signal that the model is paraphrasing from memory rather than copying from the loaded text — exactly the kind of drift the validator is designed to catch. CONTEXT.md §2 locks this too: "Case-sensitive, no punctuation folding."
4. **Guarded registry lookup.** `findSourceForId` casts the registry to `Record<string, Source | undefined>` rather than narrowing `cite.source_id` to `SourceId`. The LLM response is untrusted input, so an unknown `source_id` must produce an `unknown_source_id` flip rather than a TypeScript assertion error. The `as SourceId` cast on the survivor push is safe because the lookup succeeded, which proves the id is a real registry key.
5. **Per-task atomic commits.** Task 2.4 proposed a single combined `feat` commit covering all three files plus PLAN.md; instead followed the execute-plan workflow's task_commit_protocol (one commit per task) — same pattern Plan 01 established. Each task is now independently revertable; git bisect stays useful.

## Deviations from Plan

None — plan executed exactly as written, with the exception of Task 2.4's single-combined-commit proposal (see Decision #5 above). That's a consistent repo-wide pattern established in Plan 01 and documented in Plan 01's SUMMARY deviation list, not a new deviation.

## Issues Encountered

None. Environment was clean, no authentication gates, no network dependencies, no checkpoints. The test suite passed on the first run and again deterministically on a re-run. `pnpm tsc --noEmit` was clean on every invocation after the relevant file existed.

## Wave 2 Coordination

Plan 02 ran in parallel with Plans 03 and 04 (wave 2). Coordination notes:

- **fallback.ts ownership:** Plan 02 Task 2.1 created `src/grounding/fallback.ts` at commit `1e39e40`. Plan 04 has a create-if-missing guard for the same file, but `git log -- src/grounding/fallback.ts` shows only this plan's commit — no conflict occurred because Plan 04 either ran after Plan 02's Task 2.1 or found the file already present and skipped creation. File content is verbatim from the PLAN Task 2.1 spec.
- **No other file conflicts.** Plans 03 and 04 ship `src/llm/*` and `src/grounding/systemPrompt.ts` / `src/grounding/fewShots.ts` respectively; neither touches this plan's files.
- **Git log at plan close shows interleaved wave commits** (Plan 03 at `b71c924` / `92b3634`, Plan 04 at `d527f54`, Plan 02 at `1e39e40` / `1a71294` / `a32fa32`), which is expected for Wave 2 parallel execution.

## User Setup Required

None — this plan is pure function implementation plus unit tests. No env vars, no external services, no dashboard configuration.

## Next Phase Readiness

- **Ready for Plan 04 (system-prompt-composer):** `FALLBACK_STRING` is exported from `@/grounding/fallback` for the system prompt's `<citation_contract>` block and the COMMON_RULES section that instructs the model on the fallback wording.
- **Ready for Phase 2 (`/api/chat` route):** `validateCitations(response, registry)` is the deterministic gate on every structured response the route receives. The `_flips` array carries the per-strip diagnostic data Phase 2 will log as `{ request_id, role, validator_flips, ... }` per CONTEXT.md §2 and the Phase 2 structured-log contract.
- **Ready for Phase 2 entity-allowlist post-check (CORP-02):** this validator is the quote-match layer; the allowlist post-check is a separate layer that runs after citation validation. Nothing in this plan conflicts with or constrains that second layer.
- **Ready for Phase 3 chat UI fallback rendering (FBK-01):** chat UI will import `FALLBACK_STRING` from `@/grounding/fallback` to recognise and render the fallback path distinctly (different styling, the "Flag the gap" CTA). Constant is stable and won't move.
- **Blockers/concerns:** None introduced by this plan. The Phase-0 smoke blockers in STATE.md (MGTI baseURL suffix, json_schema strict mode, streaming cadence, Entra consent, CA chain) remain open and are addressed in Plan 05.

---
*Phase: 01-grounding-foundation*
*Completed: 2026-04-22*
