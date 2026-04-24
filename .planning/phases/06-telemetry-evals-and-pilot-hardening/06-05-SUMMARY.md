---
phase: 06-telemetry-evals-and-pilot-hardening
plan: 05
subsystem: evals
tags: [vitest, openai, gpt-4o-mini, llm-judge, flake-quarantine, eval-harness, best-of-3-voting, skipIf, positional-bias]

# Dependency graph
requires:
  - phase: 06-04-eval-harness-and-fast-suites
    provides: runner/types, runner/thresholds, runner/report, runner/fixtures, vitest.eval.config.ts, entity-allowlist + citation-substring suites
provides:
  - LLM judge abstraction (createJudgeClient + judgeBinary best-of-3) isolated from production keys
  - Flake quarantine (computeFlakes + writeFlakeReport, 10pp variance threshold, append-only)
  - Four slow eval suites: negative-oos (≥95%), paired-role (≥98%), injection-refuse (≥95%), positional (|t1-t8| ≤ 2pp)
  - Four fixture JSON files seeded with ≥10 entries each (positional ≥5)
  - pnpm eval:slow script covering all 4 suites + _postRun archival
  - History rotation: ops/evals/history/<timestamp>.json, 10-file cap
  - ops/evals/flaky-review.json (written on variance detection)
  - Extended src/evals/README.md with slow-suite docs
affects:
  - 06-06 (CI gating reads ops/evals/latest.json all_thresholds_met)
  - 06-07 (workbook queries positional_delta from failure details)
  - Future plan authors adding new judge suites

# Tech tracking
tech-stack:
  added: []
  patterns:
    - best-of-3 judge voting — prevents single-call flake from failing suite gate
    - it.skipIf(!process.env.LLM_JUDGE_API_KEY) — local-dev ergonomics without branching logic
    - direct LLM call via createLlmClient+streamAnswer for positional suite (no running server required)
    - history/ folder with ISO-timestamp filenames for chronological sorting
    - append-only flaky-review.json — manual PR required to re-trust quarantined fixtures

key-files:
  created:
    - src/evals/runner/judge.ts
    - src/evals/runner/flakeQuarantine.ts
    - src/evals/runner/__tests__/judge.test.ts
    - src/evals/runner/__tests__/flakeQuarantine.test.ts
    - src/evals/fixtures/negative-oos.json
    - src/evals/fixtures/paired-role.json
    - src/evals/fixtures/injection-refuse.json
    - src/evals/fixtures/positional.json
    - src/evals/suites/negative-oos.eval.ts
    - src/evals/suites/paired-role.eval.ts
    - src/evals/suites/injection-refuse.eval.ts
    - src/evals/suites/positional.eval.ts
    - src/evals/suites/_postRun.eval.ts
  modified:
    - package.json (eval:slow script added)
    - src/evals/README.md (slow-suite + history rotation docs)

key-decisions:
  - "gpt-4o-mini as default judge model — ~100x cheaper than gpt-4o; sufficient for binary yes/no entailment+refusal judgments; override via LLM_JUDGE_MODEL=gpt-4o"
  - "Direct LLM call (createLlmClient+streamAnswer) for positional suite — avoids requirement for running server in CI; uses production LLM keys, not judge keys"
  - "history/ folder with 10-file rotation — balances flake detection window (3 runs needed) with storage growth; ISO filenames sort chronologically without date parsing"
  - "Append-only flaky-review.json — quarantined fixtures require human PR to remove; prevents silent re-trust after transient stability"

patterns-established:
  - "best-of-3 judge voting: judgeBinary() wraps three parallel client.judge() calls; majority vote prevents single-call flake from failing gate"
  - "skipIf no-judge-key: it.skipIf(!process.env.LLM_JUDGE_API_KEY) on the single it() in each slow suite"
  - "pair_id in notes: linked consumer/author fixtures by pair_id:<id> string in notes field"

# Metrics
duration: 8min
completed: 2026-04-24
---

# Phase 6 Plan 05: Slow Suites and LLM Judge Summary

**LLM judge abstraction (best-of-3 voting, gpt-4o-mini) + four slow eval suites (neg-oos/paired-role/injection-refuse/positional) + flake quarantine with history rotation completing the SC#2 slow half**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-24T13:48:06Z
- **Completed:** 2026-04-24T13:56:00Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- Judge abstraction isolated from production keys: `createJudgeClient()` (throws if `LLM_JUDGE_API_KEY` absent) + `judgeBinary()` best-of-3 majority vote; 16 unit tests covering all 8 vote combinations + response format parsing + env-missing throw
- Four slow suites with `it.skipIf(!process.env.LLM_JUDGE_API_KEY)` — verified `LLM_JUDGE_API_KEY= pnpm eval:slow` exits 0 with all-skipped
- Flake quarantine: `computeFlakes(last3Reports)` + `writeFlakeReport()` appends to `ops/evals/flaky-review.json`; 10 unit tests; append-only with de-duplication
- `pnpm eval:slow` script added; `_postRun.eval.ts` archives `latest.json → ops/evals/history/<timestamp>.json` and prunes to 10 files
- Positional suite uses direct `createLlmClient + streamAnswer` (not HTTP `/api/chat`); stores `(1 − delta)` as `pass_rate`; injects `positional_delta` into failure details for workbook KQL
- 687 unit tests green (622+ baseline); no `.eval.ts` files in `pnpm test` surface; `pnpm typecheck` clean

## Task Commits

1. **Task 1: judge abstraction + flake quarantine** - `6e3048e` (feat)
2. **Task 2: four slow suites + fixtures + post-run archival** - `091788a` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/evals/runner/judge.ts` — createJudgeClient() throws if key absent; judgeBinary() best-of-3; gpt-4o-mini default; parses '1', '0', '1.', ' 1\n'
- `src/evals/runner/flakeQuarantine.ts` — computeFlakes() + writeFlakeReport(); variance threshold 10pp; append-only; documented interpretation in file-top comment
- `src/evals/runner/__tests__/judge.test.ts` — 16 tests; mocked OpenAI; no network calls
- `src/evals/runner/__tests__/flakeQuarantine.test.ts` — 10 tests; tmpdir isolation
- `src/evals/fixtures/negative-oos.json` — 12 OOS questions (geography, weather, jokes, translation, sports)
- `src/evals/fixtures/paired-role.json` — 10 consumer/author pairs (pair_id linked via notes field)
- `src/evals/fixtures/injection-refuse.json` — 12 adversarial prompts (ignore-instructions, print-system-prompt, DAN, SYSTEM: override, authority claim)
- `src/evals/fixtures/positional.json` — 5 multi-turn fixtures; anchor at turns[0]; filler list in notes
- `src/evals/suites/negative-oos.eval.ts` — ≥95% threshold; refusal-detection judge prompt; 2-min timeout
- `src/evals/suites/paired-role.eval.ts` — ≥98% threshold; groups by pair_id; 4-min timeout
- `src/evals/suites/injection-refuse.eval.ts` — ≥95% threshold; stayed-on-task judge prompt; 2-min timeout
- `src/evals/suites/positional.eval.ts` — |t1-t8| ≤ 2pp; direct LLM calls; 5-min timeout
- `src/evals/suites/_postRun.eval.ts` — archival + pruning + flake sweep; runs last alphabetically
- `package.json` — eval:slow script
- `src/evals/README.md` — slow-suite docs, env vars table, history rotation, flake quarantine

## Decisions Made

1. **gpt-4o-mini as default judge**: ~100x cheaper than gpt-4o; binary yes/no judgments don't need full gpt-4o capability. Authorized deviation from CONTEXT.md's gpt-4o assumption. Monthly cost drops from ~$180 to ~$0.36 (30 runs × 120 calls × $0.0001). Override via `LLM_JUDGE_MODEL=gpt-4o` if pilot flake data shows disagreement.

2. **Direct LLM call for positional suite**: `createLlmClient + streamAnswer` avoids requiring a running Next.js server in CI. Uses production LLM keys (not judge keys) — the judge only evaluates the responses. Per RESEARCH.md §Pattern 9.

3. **history/ folder with ISO filenames**: Filenames `YYYY-MM-DDTHH-mm-ssZ.json` sort chronologically with standard string sort. Cap of 10 files provides 10-night lookback while bounding storage. Windows-safe (colons replaced with hyphens).

4. **Append-only flaky-review.json**: Fixtures quarantined in run N stay until a human PR removes them even if stable in runs N+1..N+3. Prevents silent re-trust of genuinely flaky fixtures after transient good behavior.

## Deviations from Plan

None — plan executed exactly as written. The `eval:slow` script includes `_postRun.eval.ts` rather than the `_postRun.eval.ts` being implicitly last under `pnpm eval` — this is a correct implementation since the plan specifies it as a separate file sorted last alphabetically and `eval:slow` explicitly lists it.

## Issues Encountered

None.

## Next Phase Readiness

- SC#2 slow half complete: all four suites exist with fixtures, thresholds wired, CI-runnable
- `pnpm eval:slow` consumed by Plan 06-06 (CI gating workflow)
- `ops/evals/latest.json` with 6 SuiteReports (2 fast + 4 slow) after a full `pnpm eval` run
- Workbook (Plan 06-07) can query `positional_delta` from failure details
- Flake quarantine operational after 3rd nightly run (2 history entries needed for variance)

---
*Phase: 06-telemetry-evals-and-pilot-hardening*
*Completed: 2026-04-24*
