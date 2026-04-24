# Eval Harness

Deterministic and LLM-judge evaluation suites for the KB Knowledge Assistant.
Runs under a separate Vitest config (`vitest.eval.config.ts`) and never
pollutes the main `pnpm test` surface.

## Directory Layout

```
src/evals/
  runner/
    types.ts        EvalFixture, EvalResult, SuiteReport, RunReport
    thresholds.ts   Per-suite pass-rate thresholds (source of truth: ROADMAP SC#2)
    fixtures.ts     loadFixtures(suite) — reads + validates src/evals/fixtures/<suite>.json
    report.ts       writeReport / mergeAndWriteReport / readLatest — ops/evals/latest.json
    __tests__/      Unit tests for runner utilities (picked up by pnpm test)
  fixtures/
    entity-allowlist.json     Seed fixtures for entity-allowlist suite
    citation-substring.json   Seed fixtures for citation-substring suite
  suites/
    entity-allowlist.eval.ts    Fast deterministic suite (100% threshold)
    citation-substring.eval.ts  Fast deterministic suite (99% threshold)
```

## Running Evals

```bash
pnpm eval        # run all *.eval.ts suites
pnpm eval:fast   # entity-allowlist + citation-substring only (< 10 s, no LLM)
```

Report is written to `ops/evals/latest.json` after every run.

## How to Add a Fixture

1. Open `src/evals/fixtures/<suite>.json`.
2. Append a new object following the `EvalFixture` shape (see `runner/types.ts`).
3. Set `expected_behavior` to the value the suite checks — `"pass"` or `"block"` for
   entity-allowlist; `"pass"` or `"strip"` for citation-substring.
4. Use verbatim quotes from `src/grounding/sources/` for any `"pass"` citation fixtures.
5. Run `pnpm eval:fast` to confirm the new fixture passes.

## How to Add a Suite

1. Add a pass-rate threshold in `runner/thresholds.ts`.
2. Create `src/evals/fixtures/<suite>.json` with at least 5 fixtures.
3. Create `src/evals/suites/<suite>.eval.ts` following the pattern in
   `entity-allowlist.eval.ts`. Call `mergeAndWriteReport` so your suite's
   entry accumulates into `ops/evals/latest.json` alongside other suites.
4. Add the suite file to the `eval` script in `package.json` or rely on
   `pnpm eval` (which picks up all `*.eval.ts` files automatically).

## Threshold Source of Truth

Thresholds live in `src/evals/runner/thresholds.ts`. They map directly to
ROADMAP SC#2. CI (Plan 06) will gate on `all_thresholds_met: true` in
`ops/evals/latest.json`.
