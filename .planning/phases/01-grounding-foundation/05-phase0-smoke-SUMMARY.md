---
phase: 01-grounding-foundation
plan: 05
subsystem: smoke-harness
tags: [phase-0-smoke, tsx, cli-parser, openai, mgti, streaming, json-schema-strict, ca-chain, env-file]

# Dependency graph
requires:
  - phase: 01-01-scaffold-registry-schema
    provides: REGISTRY (source registry), CITATION_SCHEMA, KbResponse + Citation types
  - phase: 01-02-citation-validator
    provides: validateCitations (end-to-end grounding proof)
  - phase: 01-03-llm-client-factory
    provides: createLlmClient (dual-mode factory), streamAnswer + STRICT_SCHEMA_SUPPORTED fallback path
  - phase: 01-04-system-prompt-composer
    provides: composeSystemPrompt (role-aware system prompt used in Smokes 2 + 3)
provides:
  - scripts/phase0-smoke.ts — pnpm smoke runner; five Phase-0 checks; structured PASS/FAIL report
  - scripts/__tests__/phase0-smoke.test.ts — CLI parser unit tests (live-endpoint tests NOT in the suite)
  - docs/phase-0-smoke.md — committed PASS/FAIL evidence record; dev-mode Smokes 1/2/3 filled in; Smoke 4 DEFERRED to Phase 5; Smoke 5 BLOCKED pending MGTI access
  - package.json smoke script with `node --env-file-if-exists=.env.local` shim (tsx does not auto-load .env files unlike Next.js)
affects:
  - 02-api-chat-route (Phase 2 kickoff re-runs prod-mode smoke against MGTI before building the streaming route)
  - 02-chat-backend (STRICT_SCHEMA_SUPPORTED flag choice for prod depends on prod-mode Smoke 2 outcome)
  - 02-streaming-strategy (prod-mode Smoke 3 determines whether APIM buffers; dev-mode baseline P95=65ms is a reference only)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tsx-runnable scripts with explicit `node --env-file-if-exists=.env.local` wrapping (Next.js auto-loads .env, tsx does not)"
    - "Source markdown loaded via readFileSync + import.meta.url rather than `import X from './X.md'` — portable across Vitest / Next.js server / tsx / Node"
    - "Five-check smoke harness: one script, same createLlmClient() factory, only env vars differ between dev and prod"
    - "Structured SmokeResult record (name, status, evidence, remediation) per check — evidence template in docs/phase-0-smoke.md maps 1:1 to script output fields"
    - "Dependency-aware execution: Smoke 2/3 SKIP if Smoke 1 fails; Smoke 5 inspects prior Smoke 1/2/3 errors for UNABLE_TO_VERIFY_LEAF_SIGNATURE"
    - "CLI arg parser exported for unit testing; live-endpoint checks NOT in Vitest suite (would hit real APIs)"

key-files:
  created:
    - scripts/phase0-smoke.ts
    - scripts/__tests__/phase0-smoke.test.ts
    - docs/phase-0-smoke.md
  modified:
    - package.json (added smoke script with --env-file-if-exists shim)
    - src/grounding/registry.ts (readFileSync migration from static .md imports)

key-decisions:
  - "api.openai.com/v1 honours response_format: json_schema strict: true — dev-mode path works end-to-end. Prod-mode (MGTI) verification pending MGTI access."
  - "Dev-mode streaming cadence against api.openai.com is well within threshold (P95=65ms, 195 chunks, first-chunk 868ms) — this is a REFERENCE BASELINE only; Pitfall #10 (MGTI APIM buffering) cannot be ruled out until prod-mode Smoke 3 runs."
  - "tsx requires Node's --env-file-if-exists for .env.local loading (unlike Next.js which auto-loads via its framework runtime) — captured in package.json `smoke` script; future tsx-invoked scripts must replicate this pattern."
  - "Source markdown must be loaded via readFileSync(fileURLToPath(import.meta.url)) + relative path rather than `import X from './X.md'` — portable across Vitest (rawMarkdown Vite plugin), Next.js server runtime, tsx, and vanilla Node without plugin configuration drift."
  - "Prod-mode run (Smokes 1/2/3/5 against MGTI) deferred to Phase 2 kickoff — non-blocking for Phase 1 closure per CONTEXT.md §4, but gates Phase 2 /api/chat route construction. Tracked in STATE.md Blockers/Concerns."

patterns-established:
  - "Every Phase-0 smoke check emits a SmokeResult with evidence + remediation; evidence template in docs/phase-0-smoke.md mirrors the script's output fields 1:1 so pasting the script output yields a committed record."
  - "tsx-invoked scripts in this repo: package.json script wraps with `node --env-file-if-exists=.env.local --import tsx/esm` (or equivalent) — never assume .env auto-loading outside Next.js."
  - "Source-file loading in grounding layer: readFileSync + URL resolution, not ESM .md imports — survives every runtime we care about."

# Metrics
duration: ~15 min active (excluding user-loop checkpoint wait)
completed: 2026-04-22
---

# Phase 1 Plan 05: Phase-0 Smoke Summary

**Five-check Phase-0 smoke harness (pnpm smoke --mode=dev|prod) proving the full Phase 1 grounding substrate — createLlmClient + streamAnswer + composeSystemPrompt + validateCitations — works end-to-end against a real LLM endpoint, with dev-mode Smokes 1/2/3 green against api.openai.com and prod-mode (MGTI) smokes deferred to Phase 2 kickoff pending corporate access.**

## Performance

- **Duration:** ~15 min active authoring + user-in-loop dev-mode run (checkpoint wait excluded)
- **Completed:** 2026-04-22
- **Tasks:** 7 (5.1 script + CLI parser, 5.2 parser tests, 5.3 evidence template, 5.4 full-suite gate, 5.5 dev-mode live smoke [human-verify], 5.6 prod-mode live smoke [deferred], 5.7 Phase 1 closure)
- **Files created:** 3 (scripts/phase0-smoke.ts, scripts/__tests__/phase0-smoke.test.ts, docs/phase-0-smoke.md)
- **Files modified:** 2 (package.json via deviation, src/grounding/registry.ts via deviation)

## Accomplishments

- `pnpm smoke -- --mode=dev` runs the end-to-end Phase 1 code path against api.openai.com using createLlmClient() and returns a KbResponse-shaped `{can_answer, answer, citations[]}` — confirmed PASS with a validator-verified citation (validator_flips=0) and a 195-chunk stream at P95=65ms inter-chunk latency.
- Same script supports `--mode=prod` against MGTI using identical code paths — only env vars differ. Prod-mode run is deferred (BLOCKED on MGTI key / CA bundle / deployment name) but the code path is exercised-and-ready; Phase 2 kickoff re-surfaces this as a gate before /api/chat construction.
- Five Phase-0 checks implemented: (1) baseURL suffix + auth, (2) json_schema strict mode, (3) streaming chunk cadence, (4) Entra SPA consent (deferred to Phase 5 by design), (5) corporate CA chain (detected via Smoke 1/2/3 error patterns in prod mode).
- Dependency-aware check execution: if Smoke 1 fails, Smokes 2 and 3 SKIP with a clear reason rather than producing cascade failures. Smoke 5 inspects prior results for UNABLE_TO_VERIFY_LEAF_SIGNATURE or "unable to verify the first certificate" patterns rather than running its own TLS probe.
- CLI arg parser exported and unit-tested: 5 test cases covering `--mode=dev`, `--mode=prod`, mixed-arg parsing, missing `--mode`, and invalid `--mode` value. Full Vitest suite: 70/70 tests green across 8 suites (65 previous + 5 new CLI parser tests).
- `docs/phase-0-smoke.md` is the committed PASS/FAIL ledger; dev-mode Smokes 1/2/3 filled with real evidence (baseURL, responseSnippet, chunkCount, P95, validator_flips), Smoke 4 reads "DEFERRED — see Phase 5", Smoke 5 reads "BLOCKED — pending MGTI access (non-blocking for Phase 1 closure)". Phase 1 closure checklist at the bottom of the file ticks all five items (3 PASS / 1 DEFERRED / 1 BLOCKED-non-blocking).
- Phase 1 Success Criterion #3 partially demonstrated: the factory + stream facade works end-to-end against a real LLM (api.openai.com). Prod-mode demonstration deferred to Phase 2 gate.
- Phase 1 Success Criterion #4 partially met: 3 of 5 Phase-0 items green, 1 deferred by design, 1 blocked with documented remediation and Phase 2 gate.

## Task Commits

Each task was committed atomically where it produced code or docs:

1. **Task 5.1: Smoke script + CLI parser** — `7e23799` (feat)
2. **Task 5.2: parseCliArgs unit tests** — `2691b97` (test)
3. **Task 5.3: Evidence template** — `853b46f` (docs)
4. **Task 5.4: Full-suite green + typecheck clean** — no commit (verification-only; 8 suites green, `pnpm tsc --noEmit` clean)
5. **Task 5.5: Dev-mode live smoke (human-verify checkpoint)** — `4be811a` (docs: all 3 dev-mode smokes PASS)
6. **Task 5.6: Prod-mode live smoke (human-verify checkpoint)** — no commit; DEFERRED to Phase 2 kickoff pending MGTI access. User response: `blocked: no-mgti-access`.
7. **Task 5.7: Phase 1 closure (this plan's metadata commit)** — captured in the Plan 05 docs metadata commit staged alongside this SUMMARY.

**Orchestrator deviation commits** (landed between 5.1 and 5.5; see Deviations below):
- `bf696a3` — fix(phase-1/plan-01): load source markdown via readFileSync for tsx compat
- `2995e88` — fix(phase-1/plan-05): load .env.local via Node --env-file-if-exists

**Plan metadata commit:** _(captures this SUMMARY.md + PLAN.md + docs/phase-0-smoke.md final state — hash assigned at end of plan)_

## Files Created/Modified

### Created

- `scripts/phase0-smoke.ts` — five-check Phase-0 runner; parseCliArgs + runSmokes + SmokeResult report structure
- `scripts/__tests__/phase0-smoke.test.ts` — 5 CLI-parser unit tests
- `docs/phase-0-smoke.md` — committed evidence record with five Smoke sections + closure checklist

### Modified (via deviation fixes)

- `package.json` — added `"smoke"` script wrapping tsx invocation with `node --env-file-if-exists=.env.local` so .env.local loads before createLlmClient() reads env() (orchestrator commit `2995e88`)
- `src/grounding/registry.ts` — migrated source markdown loading from `import X from './sources/X.md'` (Vitest-plugin-dependent) to `readFileSync(fileURLToPath(new URL('./sources/X.md', import.meta.url)))` so the loader works under tsx/Node without the rawMarkdown Vite plugin (orchestrator commit `bf696a3`). Surfaced when the smoke script tried to import REGISTRY under tsx and failed on the .md static import.

## Decisions Made

1. **api.openai.com/v1 honours json_schema strict mode end-to-end.** Dev-mode Smoke 2 PASS with `can_answer=true`, a real citation whose quote is a verbatim substring of the loaded source body (validator_flips=0), and the full `{can_answer, answer, citations[]}` shape. This confirms the code path is correct against a reference endpoint. MGTI may or may not honour strict mode identically — that decision is held open until prod-mode Smoke 2 runs; the STRICT_SCHEMA_SUPPORTED=false fallback path is already implemented in streamAnswer (Plan 03) and exercised by unit tests, so the prod switch is a one-env-var change if needed.

2. **Dev-mode streaming cadence is a reference baseline, NOT a prod surrogate.** Smoke 3 against api.openai.com delivered 195 chunks at P95=65ms inter-chunk and first-chunk=868ms — roughly 10× under the 500ms threshold. This proves the code path produces a well-formed stream and the test harness measures it correctly. It does NOT rule out Pitfall #10 (MGTI APIM buffering chunks into one lump). Phase 2's streaming strategy cannot rely on this baseline; prod-mode Smoke 3 is a Phase 2 gate.

3. **tsx does not auto-load .env.local; Next.js does.** Next.js's built-in dev server loads `.env.local` automatically as part of its framework runtime. tsx (invoked via pnpm smoke) is a thin ESM loader — it does NOT load .env files. Fixed by wrapping the smoke script in `node --env-file-if-exists=.env.local --import tsx/esm scripts/phase0-smoke.ts` via the package.json `smoke` script (orchestrator commit `2995e88`). This pattern must be replicated for any future tsx-invoked script in this repo that reads env().

4. **Source markdown loading: readFileSync, not ESM .md imports.** Plan 01 originally used `import kb0020882 from './sources/kb0020882.md'` — which works under Vitest (custom rawMarkdown Vite plugin from Plan 01's vite.config.ts) and Next.js server runtime (Turbopack supports `{ type: 'raw' }` loading), but FAILS under tsx/vanilla Node, which have no .md loader. Fixed by migrating `src/grounding/registry.ts` to `readFileSync(fileURLToPath(new URL('./sources/X.md', import.meta.url)))` — portable across Vitest, Next.js server, tsx, and vanilla Node. Orchestrator commit `bf696a3`.

5. **Prod-mode run deferred, Phase 1 closes with it documented.** Per CONTEXT.md §4 and Plan 05 Task 5.6 ("Phase 1 can close on dev-mode green + prod-mode documented-but-pending if MGTI access is not yet provisioned"), the prod-mode run is a non-blocking closure item. User signal at checkpoint: `blocked: no-mgti-access`. STATE.md Blockers/Concerns now names this as a Phase 2 gate: prod-mode Smokes 1/2/3/5 must run against MGTI before `/api/chat` route implementation begins.

## Deviations from Plan

### Auto-fixed Issues

Three orchestrator-level corrections landed during Plan 05 execution. All three are Rule 3 (blocking) fixes that the executor could not resolve unilaterally because they required environment-level changes (project-wide source-loader pattern, package.json tooling config, user-operational status of MGTI access) outside the narrow scope of the executor's task loop.

**1. [Rule 3 - Blocking] Source markdown loader incompatible with tsx runtime**

- **Found during:** Task 5.1 first local run of the smoke script
- **Issue:** `src/grounding/registry.ts` used static `import kb0020882 from './sources/kb0020882.md'` style imports. Plan 01 configured a custom `rawMarkdown` Vite plugin in `vite.config.ts` so Vitest could load .md files; Next.js Turbopack has its own `{ type: 'raw' }` loader. Neither applies under tsx — the smoke script crashed at `import { REGISTRY } from '@/grounding/registry'` because tsx saw raw `.md` ESM imports it had no loader for.
- **Fix:** Migrated registry.ts to runtime loading via `readFileSync(fileURLToPath(new URL('./sources/X.md', import.meta.url)))`. This works under every runtime in the matrix (Vitest, Next.js server, tsx, vanilla Node) without plugin config drift. No API change to REGISTRY consumers.
- **Files modified:** `src/grounding/registry.ts`
- **Verification:** `pnpm test` stayed green (all 70 tests pass, registry loading under Vitest unchanged in behaviour); `pnpm tsc --noEmit` clean; `pnpm smoke --mode=dev` imports the REGISTRY successfully.
- **Committed in:** `bf696a3` (fix(phase-1/plan-01): load source markdown via readFileSync for tsx compat) — attributed to Plan 01 since the root-cause change is in Plan 01's code, but surfaced by Plan 05's smoke runner.

**2. [Rule 3 - Blocking] pnpm smoke did not load .env.local**

- **Found during:** Task 5.1 first local run of the smoke script, after fix #1
- **Issue:** Smoke script crashed with "LLM_API_KEY missing" because tsx does not auto-load `.env.local` the way Next.js does. Plan 05 Task 5.1's action body did not specify the .env loading contract, assuming "same as any Next.js script"; that assumption was wrong for tsx.
- **Fix:** Updated `package.json` `smoke` script to `node --env-file-if-exists=.env.local --import tsx/esm scripts/phase0-smoke.ts` (or equivalent wrapper), so Node loads `.env.local` before tsx evaluates the script and before createLlmClient() reads env().
- **Files modified:** `package.json`
- **Verification:** `pnpm smoke -- --mode=dev` now loads env correctly and proceeds to Smoke 1; the user's subsequent live run produced all 3 dev-mode smokes PASS.
- **Committed in:** `2995e88` (fix(phase-1/plan-05): load .env.local for pnpm smoke via Node --env-file-if-exists).

**3. [Rule 3 - Blocking] Prod-mode Smoke 5 BLOCKED rather than PASS**

- **Found during:** Task 5.6 checkpoint; user response `blocked: no-mgti-access`
- **Issue:** Plan 05 Task 5.6 assumed MGTI credentials, gpt-4o deployment name, and the MMC corporate CA bundle would be available during Phase 1 closure. They were not. The code path is correct and testable; only operational access is missing.
- **Fix:** Per Plan 05's own escape hatch ("Phase 1 can close on dev-mode green + prod-mode documented-but-pending if MGTI access is not yet provisioned"), closed Phase 1 with the prod-mode run as a tracked Phase 2 gate. Smoke 5 in `docs/phase-0-smoke.md` reads "BLOCKED — pending MGTI access (non-blocking for Phase 1 closure)" with the full remediation checklist preserved for whoever re-runs it. STATE.md Blockers/Concerns names it as the Phase 2 gate.
- **Files modified:** `docs/phase-0-smoke.md` (Smoke 5 section + closure checklist); `.planning/STATE.md` (Blockers/Concerns)
- **Verification:** Phase 1 closure checklist in `docs/phase-0-smoke.md` shows 3/5 items PASS, 1/5 DEFERRED (by design), 1/5 BLOCKED (non-blocking for Phase 1, gates Phase 2). STATE.md accurately represents the partial closure.
- **Committed in:** This plan metadata commit.

---

**Total deviations:** 3 auto-fixed (3 blocking — one pattern-level code fix, one tooling config fix, one operational-status documentation fix)
**Impact on plan:** All three fixes were necessary for Plan 05 to complete. None introduced scope creep: fix #1 corrects a latent Plan 01 portability issue surfaced by Plan 05's new runtime; fix #2 patches a .env loading assumption in Plan 05's own tooling; fix #3 is the documented escape hatch Plan 05 itself provided for the no-MGTI-access case. Plan's Success Criteria #3 and #4 are partially met (dev-mode green proves the code path; prod-mode is a tracked Phase 2 gate).

## Issues Encountered

**Wave 3 dependency on Wave 1/2 latent bugs.** Plan 05 is the first code in the project to run under tsx (outside Vitest/Next.js). Two latent issues in earlier plans surfaced here: the .md static-import pattern (Plan 01) and the .env auto-loading assumption (Plan 05's own scaffolding). Both are now fixed project-wide. Lesson for Phase 2: any new runtime target (e.g. Azure App Service standalone build) should be smoke-tested with a minimal script before the first real feature is built on it.

**No regression from readFileSync migration.** The registry loader change in `bf696a3` was load-bearing across Plans 01-04 but produced zero test regressions — all 70 tests remained green, TypeScript strict stayed clean, no snapshot files changed. readFileSync + URL resolution is pattern-equivalent to static .md imports for all downstream consumers.

**Checkpoint serialisation worked as designed.** Plan 05 hit checkpoint 5.5 (dev-mode human-verify), returned structured state to the orchestrator, and a fresh continuation agent (this one) resumed at 5.7 with full context. No re-execution of completed tasks; commit hashes verified present before proceeding.

## User Setup Required

**For the deferred prod-mode run** (Phase 2 kickoff):
- MGTI-issued API key (from MMC platform team)
- Confirmed `LLM_BASE_URL` suffix for gpt-4o deployment
- MGTI deployment name for gpt-4o
- MMC corporate CA bundle PEM file installed at a known absolute path
- `NODE_EXTRA_CA_CERTS=<absolute-path-to-bundle>` set in SHELL ENV (not `.env`) — see `docs/phase-0-smoke.md` Smoke 5 remediation

Once all four are in place, `pnpm smoke -- --mode=prod` completes the prod-mode evidence and the Phase 2 `/api/chat` route can begin construction.

## Next Phase Readiness

**Ready for Phase 2 (Chat Backend BFF) with one gate:**

- Phase 1 code path is proven end-to-end in dev mode. The same `createLlmClient() + streamAnswer() + composeSystemPrompt() + validateCitations()` chain the Phase 2 `/api/chat` route will use is demonstrably working against a real LLM endpoint — dev mode hits api.openai.com, validates json_schema strict, validates a real citation, and streams 195 chunks.
- Open Phase 2 gate: prod-mode Phase-0 smoke against MGTI (Smokes 1/2/3/5) must run before `/api/chat` route construction. Blocks only `/api/chat`; does not block Phase 2 planning documents or BFF scaffold work.
- .env.local loading pattern documented in package.json; future tsx-invoked scripts inherit the `node --env-file-if-exists=.env.local` wrapping.
- Source-loader portability established: readFileSync + URL resolution works everywhere; no plugin drift across runtimes.
- Phase 2 Blockers/Concerns inherits: prod-mode smoke (non-blocking for planning, blocking for code). Expand .env handling docs + MGTI access checklist in Phase 2 CONTEXT.md.

**Phase 1 successes summarised:**
- Success Criterion #1 (snapshot tests for composeSystemPrompt): met by Plan 04.
- Success Criterion #2 (validator rejects fabricated quotes, accepts verbatim): met by Plan 02.
- Success Criterion #3 (same factory, only env differs, both honour strict): partially met — dev-mode green; prod-mode deferred.
- Success Criterion #4 (all 5 Phase-0 resolutions documented and green): partially met — 3 green, 1 deferred by design, 1 blocked with documented remediation and Phase 2 gate.
- Success Criterion #5 (three source files + registry with section IDs matching enum): met by Plan 01.

---
*Phase: 01-grounding-foundation*
*Completed: 2026-04-22*
