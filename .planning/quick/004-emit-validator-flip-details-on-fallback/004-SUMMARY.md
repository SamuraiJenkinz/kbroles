---
quick: 004
title: Emit validator-flip details on validator_flip and all_citations_stripped events
date: 2026-04-29
commit: e098ebc
subsystem: telemetry
tags: [telemetry, pino, otel, grounding, validator, diagnostics]

dependency-graph:
  requires: [quick-003]
  provides: per-citation flip diagnostics in pino structured logs on partial-strip and all_citations_stripped paths
  affects: []

tech-stack:
  added: []
  patterns:
    - "extras param on trackEvent(): structured fields (arrays/objects) routed only to pino, not OTel span attributes"
    - "summarizeFlips() defensive cap pattern: slice + truncation marker"

key-files:
  created: []
  modified:
    - src/obs/telemetry.ts
    - src/app/api/chat/route.ts
    - src/app/api/chat/__tests__/route.test.ts
    - src/obs/__tests__/telemetry.test.ts

decisions:
  - id: extras-pino-only
    choice: "Optional 4th extras param on trackEvent() flows ONLY to pino, not OTel attributes"
    rationale: "App Insights customDimensions is a flat string map; arrays/objects would coerce to '[object Object]'. Pino serialises them correctly as JSON. Keeps App Insights schema clean."
    alternatives: ["JSON.stringify flips as a string dimension — rejected because hard to query in jq/pino-pretty and harder to project into App Insights KQL workbook than native JSON serialisation"]

metrics:
  duration: "~15 minutes"
  completed: 2026-04-29
---

# Quick Task 004: Emit validator-flip details on validator_flip and all_citations_stripped events

**One-liner:** `trackEvent()` extended with `extras` param (pino-only, non-OTel); `summarizeFlips()` helper added; flip arrays now emitted on `validator_flip` and `fallback_trigger(all_citations_stripped)` events.

## Commit

| Field | Value |
|-------|-------|
| Hash | `e098ebc` |
| Subject | `feat(telemetry): emit validator-flip details on validator_flip and all_citations_stripped events` |
| Branch | `master` |
| Co-Author | `Claude Opus 4.7 (1M context) <noreply@anthropic.com>` |

## Files Modified

### `src/obs/telemetry.ts`

| Line | Change |
|------|--------|
| 37–48 | Added `export type EventExtras = Record<string, unknown>` with full JSDoc (PII contract, OTel-skip rationale) |
| 66–70 | Extended `trackEvent()` signature with optional 4th param `extras: EventExtras = {}` |
| 96 | Updated `logger.info(...)` to spread `...extras` after dimensions/measurements |

**Key invariant:** `extras` is NOT added to `attrs` (the OTel span attributes object). The spread only touches the pino `logger.info` payload. App Insights customDimensions schema is unaffected.

### `src/app/api/chat/route.ts`

| Line | Change |
|------|--------|
| 92–109 | Added `summarizeFlips()` helper function between `export const dynamic` and `const SSE_HEADERS` |
| 337–343 | `validator_flip` call site: added `summarizeFlips(validated._flips, 10)` as 4th arg |
| 351–357 | `fallback_trigger(all_citations_stripped)` call site: added `{}` as 3rd arg (no measurements) and `summarizeFlips(validated._flips, 10)` as 4th arg |

`summarizeFlips` only forwards `source_id`, `section_id`, `reason` — no `quote` field. Cap is 10 entries; `flips_truncated: true` set when cap fires. No other `trackEvent` call sites were touched (lines 326, 338/339/344, 395, 409/430, 483).

### `src/app/api/chat/__tests__/route.test.ts`

| Line | Change |
|------|--------|
| 849–852 | Widened `getEventCalls()` return type from 3-tuple to 4-tuple to capture the new `extras` positional arg |
| 999–1033 | Added new test: `'fallback_trigger with reason="all_citations_stripped" includes flips array (per-citation diagnostics)'` |

New test uses `WRONG_SOURCE` (unknown_source_id flip) and `KB0020882/who-can-submit` with a bogus quote (quote_not_in_body flip) to exercise multiple flip reasons. Asserts: `extras.flips` is a non-empty array, `flips_truncated === false`, and `Object.keys(f).sort()` equals exactly `['reason', 'section_id', 'source_id']` (privacy regression guard — any future addition of `quote` to flip records will fail this assertion).

### `src/obs/__tests__/telemetry.test.ts`

| Line | Change |
|------|--------|
| 155–175 | Added new test: `'extras param flows to pino logger.info but NOT to OTel span attributes'` |

Asserts `flips` and `flips_truncated` appear in the `mockLoggerInfo` binding object AND that `'flips' in options.attributes` and `'flips_truncated' in options.attributes` are both `false`.

## Confirmed Invariants

- `git diff HEAD~1 HEAD -- src/grounding/validator.ts` is empty — `FallbackFlip` interface and `validateCitations()` are byte-identical to before this commit.
- `git diff package.json pnpm-lock.yaml` is empty — no new dependencies.
- `pnpm typecheck` exits 0 — no type errors introduced.
- All existing tests stay green.

## Test Counts

| Scope | Before | After | Delta |
|-------|--------|-------|-------|
| `src/app/api/chat src/grounding src/obs` | 136 | 138 | +2 |
| Whole suite (from STATE.md baseline) | 731 | 733 | +2 |

Note: The plan projected 731 + 1 = 732 (one new test). Actual delta is +2 because both the `route.test.ts` flip-diagnostics test AND the `telemetry.test.ts` extras-param test were added as distinct test cases. Both are load-bearing (one exercises the full call-site integration, one exercises the OTel-isolation contract in isolation).

## Deviations from Plan

None — plan executed exactly as written with one minor clarification:

The plan said "731 + 1 = 732 expected." The telemetry test in Step 4 was described as "add ONE small assertion to the existing test suite" which could be read as augmenting an existing test or adding a new `it()`. A new `it()` was added (rather than appending to an existing test) because the extras-OTel-isolation behaviour is a distinct contract from the existing synchronicity/span/pino tests and deserves its own failure point. This is the correct approach per the TDD principles and aligns with the plan's language ("new assertion" / "add a minimal new test"). Net result: +2 tests instead of +1, both intentional.

## Push Status

Not pushed — per constraints, orchestrator handles push after closure commit.
