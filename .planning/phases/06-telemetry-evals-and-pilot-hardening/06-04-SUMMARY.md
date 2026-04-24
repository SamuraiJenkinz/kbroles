---
phase: 06
plan: 04
subsystem: evals
status: complete
completed: 2026-04-24
duration: ~7 min
tags: [vitest, evals, fixtures, citation-validation, entity-allowlist, report-writer]

dependency-graph:
  requires:
    - "01 (validateCitations + REGISTRY)"
    - "02 (checkEntityAllowlist)"
  provides:
    - "pnpm eval:fast (deterministic eval gate, <10s)"
    - "ops/evals/latest.json (CI artifact contract)"
    - "src/evals/runner/* (harness infrastructure for Plans 05+06)"
  affects:
    - "06-05 (slow suites extend runner/report/thresholds)"
    - "06-06 (CI gates on all_thresholds_met in latest.json)"

tech-stack:
  added: []
  patterns:
    - "vitest.eval.config.ts separation from vitest.config.mts"
    - "merging JSON report writer (read-modify-write to accumulate suites)"
    - "per-suite pass-rate threshold registry (THRESHOLDS const)"
    - "maxWorkers=1 in eval config to prevent read-modify-write race"

key-files:
  created:
    - vitest.eval.config.ts
    - src/evals/runner/types.ts
    - src/evals/runner/thresholds.ts
    - src/evals/runner/fixtures.ts
    - src/evals/runner/report.ts
    - src/evals/runner/__tests__/fixtures.test.ts
    - src/evals/runner/__tests__/report.test.ts
    - src/evals/fixtures/entity-allowlist.json
    - src/evals/fixtures/citation-substring.json
    - src/evals/suites/entity-allowlist.eval.ts
    - src/evals/suites/citation-substring.eval.ts
    - src/evals/README.md
  modified:
    - vitest.config.mts (added exclude for src/evals/suites/**/*.eval.ts)
    - package.json (added eval + eval:fast scripts)

decisions:
  made:
    - id: bespoke-vitest-runner
      decision: "Bespoke Vitest runner over promptfoo"
      rationale: "No new dependency; uses the existing Vitest toolchain; eval suites are simple deterministic asserts or thin wrappers over guards we own"
      date: 2026-04-24
    - id: ops-evals-latest-json
      decision: "ops/evals/latest.json as CI artifact contract"
      rationale: "Single canonical file; CI (Plan 06) can gate on all_thresholds_met: true without knowledge of individual suite names"
      date: 2026-04-24
    - id: maxworkers-1
      decision: "maxWorkers=1 in vitest.eval.config.ts"
      rationale: "mergeAndWriteReport is a read-modify-write operation; running suites in parallel caused a race that corrupted latest.json. Sequential forks are sufficient for the <10s budget of fast suites."
      date: 2026-04-24
---

# Phase 06 Plan 04: Eval Harness and Fast Suites Summary

**One-liner:** Vitest eval harness with merging JSON reporter, per-suite threshold registry, and two deterministic fast suites (entity-allowlist 100%, citation-substring 99%) calling Phase 1/2 guards — `pnpm eval:fast` in 556ms.

## Objective

Stand up the eval harness infrastructure and two deterministic fast suites. No LLM-judge work. Goal: a clean `pnpm eval:fast` that CI can gate on and that never touches the main `pnpm test` surface.

## What Was Built

### Task 1: Runner infrastructure

- `src/evals/runner/types.ts` — `EvalFixture`, `EvalResult`, `SuiteReport`, `RunReport` TypeScript interfaces
- `src/evals/runner/thresholds.ts` — `THRESHOLDS` const (6 suites from ROADMAP SC#2; `positional` documented as delta not pass-rate)
- `src/evals/runner/fixtures.ts` — `loadFixtures(suite)` with Zod v4 validation; descriptive errors for missing file, bad JSON, schema failures, empty array
- `src/evals/runner/report.ts` — `writeReport`, `mergeAndWriteReport`, `readLatest`; merging helper reads existing report, replaces or appends the matching suite entry, recomputes `all_thresholds_met`
- `src/evals/runner/__tests__/{fixtures,report}.test.ts` — 15 unit tests (all green under `pnpm test`)
- `vitest.eval.config.ts` — separate Vitest config with `include: ['src/evals/suites/**/*.eval.ts']`, `maxWorkers=1` to prevent merge race
- `vitest.config.mts` — added `exclude: ['src/evals/suites/**/*.eval.ts']` (RESEARCH Pitfall 5)
- `package.json` — added `eval` and `eval:fast` scripts (NOT `eval:slow` — Plan 05 owns that)
- `src/evals/README.md` — directory layout, how-to-add-fixture, how-to-add-suite, threshold source-of-truth

### Task 2: Seed fixtures and fast suites

- `src/evals/fixtures/entity-allowlist.json` — 8 fixtures (5 pass + 3 block); exercises `checkEntityAllowlist` with all entity classes (names, kbIds, URLs)
- `src/evals/fixtures/citation-substring.json` — 12 fixtures; 8 pass cases with verbatim quotes from KB0022991, KB0020882, SNOW_FORM; 3 strip cases (fabricated quote, unknown source, unknown section); 1 whitespace-variation case (doubled spaces normalised by validator)
- `src/evals/suites/entity-allowlist.eval.ts` — calls `checkEntityAllowlist` directly; 100% threshold; uses `mergeAndWriteReport`
- `src/evals/suites/citation-substring.eval.ts` — calls `validateCitations(response, REGISTRY)` directly; ≥99% threshold; interprets `can_answer=false || _flips.length>0` as "strip"

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm eval:fast` both suites pass | PASS — 556ms, 2/2 tests green |
| `ops/evals/latest.json` valid JSON with 2 SuiteReports | PASS — both entries present, `all_thresholds_met: true` |
| `jq '.suites[].threshold_met'` returns `true, true` | PASS |
| `pnpm test` — zero `.eval.ts` files in output | PASS — 0 matches, Pitfall 5 clean |
| 622+ unit tests green (previously 597; Plan 06-01 added 25) | PASS — 622/622 |
| No `.eval.ts` file picked up by main test runner | PASS |
| `pnpm typecheck` clean | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed citation-substring fixture cit-002 with bold-marker text**

- **Found during:** Task 2 `pnpm eval:fast` first run
- **Issue:** Fixture cit-002 used quote `"ServiceNow creates a knowledge feedback task record."` but the source has `ServiceNow creates a **knowledge feedback task** record.` — the validator's `quoteExistsInBody` does substring matching on the raw (whitespace-normalised) body which retains `**` markdown markers. The plain quote failed to match.
- **Fix:** Replaced cit-002 quote with the clean sentence `"Flagging is the correct path for any content concern raised by a non-SME."` which has no bold markers.
- **Files modified:** `src/evals/fixtures/citation-substring.json`

**2. [Rule 1 - Bug] Fixed concurrent write race on ops/evals/latest.json**

- **Found during:** Task 2 first `pnpm eval:fast` run
- **Issue:** Both eval suites ran in parallel (Vitest forks default = max CPU), both called `mergeAndWriteReport` concurrently. The read-modify-write is not atomic; the second fork read the file before the first fork wrote, so the second write clobbered the first. Result: latest.json contained two concatenated JSON objects (invalid JSON).
- **Fix:** Added `maxWorkers: 1, minWorkers: 1` to `vitest.eval.config.ts`. Sequential fork execution preserves the <10s budget (556ms total) while eliminating the race.
- **Files modified:** `vitest.eval.config.ts`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Bespoke Vitest runner over promptfoo | No new dependency; existing toolchain; deterministic suites need no LLM plumbing |
| `ops/evals/latest.json` as CI artifact contract | Single canonical file; CI gates on `all_thresholds_met` without knowing suite names |
| `maxWorkers=1` in eval config | Prevents read-modify-write race in `mergeAndWriteReport` without needing file locking |

## Next Phase Readiness

Plan 05 (slow suites + LLM-judge) can extend the runner by:
1. Adding fixtures to `src/evals/fixtures/negative-oos.json` etc.
2. Creating `src/evals/suites/negative-oos.eval.ts` (same pattern)
3. Adding `eval:slow` script to `package.json`
4. The threshold registry already has entries for all 6 planned suites

No blockers or concerns for Plans 05-06.
