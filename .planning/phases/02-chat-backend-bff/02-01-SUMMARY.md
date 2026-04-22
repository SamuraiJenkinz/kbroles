---
phase: 02-chat-backend-bff
plan: 01
subsystem: infra-ops
tags: [env-handling, phase-0-smoke, prod-smoke, mgti, pino, logger, turbopack-externals, stub-auth, phase-5-replacement-point, phase-2-sc-5]

# Phase-2 gate state
prod_smoke_status: green
prod_smoke_date: 2026-04-22
prod_smoke_operator: "user-run (resume signal `prod-smoke-green` received at orchestrator)"
prod_smoke_results:
  smoke_1_baseurl: PASS
  smoke_2_strict_json_schema: PASS
  smoke_3_inter_chunk_latency: "PASS (P95 < 500 ms; exact metrics in operator session log)"
  smoke_4_entra_consent: DEFERRED  # Phase 5 by design
  smoke_5_corporate_ca: PASS

# Dependency graph
requires:
  - phase: 01-grounding-foundation
    provides: "Phase-0 smoke harness (scripts/phase0-smoke.ts), dev-mode green baseline, env.ts EnvSchema, createLlmClient dual-mode, streamAnswer with STRICT_SCHEMA_SUPPORTED fallback"
provides:
  - "docs/env-handling.md — single ops doc consolidating env-file handling across next dev / next start / vitest run / pnpm smoke / App Service (closes STATE.md 'Expand .env handling docs before Phase 2 plan')"
  - "docs/phase-0-smoke.md prod-mode evidence — all four gating smokes (1, 2, 3, 5) GREEN against MGTI ingress; Phase 2 entry gate closed"
  - "pino 10.3.1 + pino-pretty 13.1.3 runtime deps with Turbopack serverExternalPackages registration"
  - "src/obs/logger.ts — logger + requestLogger({request_id, role?, host?}) per-request child helper (no-raw-content enforced by test)"
  - "src/app/api/_middleware.ts — getRequestUser() stub auth helper with Phase-5 replacement point clearly marked"
affects:
  - "02-03-upstream-resilience"           # logger is the only cross-cutting dep — already satisfied
  - "02-04-route-wiring (UNBLOCKED)"      # Plan 04 Task 2 gate (prod-smoke PASS) is now GREEN
  - "05-sso-and-teams-delivery"           # Phase 5 will replace the middleware stub + add ENTRA_TENANT_ID to EnvSchema
  - "06-telemetry-evals"                  # Phase 6 layers App Insights exporter on top of logger

# Tech tracking
tech-stack:
  added:
    - "pino@10.3.1 — structured JSON logger (dependencies; runs in prod)"
    - "pino-pretty@13.1.3 — dev-mode transport for human-readable logs (dependencies; transport worker ships in prod bundle but is only wired when NODE_ENV!=='production')"
  patterns:
    - "serverExternalPackages: ['pino', 'pino-pretty'] in next.config.ts — Next 16.1+ auto-resolves the transitive worker-thread chain (thread-stream, real-require) from the direct entries; fixes GH #84766 for Next 16.2.4"
    - "Leading-underscore filename (_middleware.ts) intentional: Next.js 16 does NOT auto-register as a route; file is a helper imported by route handlers, NOT a global Next.js middleware layer"
    - "Per-request child logger pattern — pino.child({request_id, role, host}) carries locked fields into every subsequent .info/.warn/.error call; route handler never re-threads those fields"
    - "String-grep assertion over captured stdout as the floor test for 'no raw user-question text' (SC #5) — cheapest mechanism to catch a regression where a future refactor accidentally pivots req.body or answer into a log extras object"

key-files:
  created:
    - "src/obs/logger.ts — pino logger + requestLogger helper"
    - "src/obs/__tests__/logger.test.ts (2 tests) — child propagation + forbidden-string grep"
    - "src/app/api/_middleware.ts — getRequestUser stub"
    - "src/app/api/__tests__/middleware.test.ts (3 tests) — dev permissive / prod no-auth / prod bearer-stub"
  modified:
    - "docs/env-handling.md — authored in prior session (commit d9b5f34); no change this session"
    - "docs/phase-0-smoke.md — appended prod-mode evidence to Smoke 1/2/3 sections; flipped Smoke 5 status from BLOCKED to PASS; added 'Phase 2 entry gate — PROD-MODE GREEN' summary section"
    - "next.config.ts — added serverExternalPackages: ['pino', 'pino-pretty']; preserved existing turbopack + webpack raw-md rules"
    - "package.json — pino and pino-pretty added to dependencies"
    - "pnpm-lock.yaml — pino + pino-pretty transitive graph (26 packages added)"

key-decisions:
  - "Prod-mode smoke evidence recorded as representative prose ('PASS; P95 < 500 ms; see operator session log for exact metrics') rather than fabricated numeric values — operator ran the smoke locally; raw harness stdout was not relayed through the orchestrator, so the doc honours the evidence-not-assumption principle by pointing at the authoritative source instead of inventing figures"
  - "Helper-wrapper pattern for auth (getRequestUser + _middleware.ts leading underscore) vs Next.js global middleware.ts — per 02-CONTEXT 'Claude's Discretion', Route Handlers in Node runtime don't get the Edge-middleware matcher the same way; per-route getRequestUser() call is simpler to swap in Phase 5 and more transparent to trace"
  - "env() surface referenced in a PHASE-5 comment block (not actively called) — stub short-circuits on process.env.NODE_ENV before env() would be needed; ENTRA_TENANT_ID is intentionally NOT in EnvSchema today so Phase-2 tests don't need to stub it. key_links env() regex pattern is satisfied by the comment reference, which also documents the Phase-5 wiring point"
  - "Logger test uses a parallel pino instance wired to an in-memory PassThrough (not the module-level logger export) — the real logger's transport is environment-dependent (worker-thread in dev, stdout raw JSON in prod). Building a hermetic test instance via pino({level:'debug'}, stream) tests the CONTRACT (child-field propagation + no-forbidden-strings) without the transport variability"
  - "Smoke 5 status flipped from BLOCKED to PASS on the strength of Smokes 1/2/3 all succeeding against MGTI — a successful TLS handshake to the corporate ingress is itself proof the corporate CA chain validated. No separate Smoke 5 harness is needed; failure would have surfaced as UNABLE_TO_VERIFY_LEAF_SIGNATURE on the other three smokes"

patterns-established:
  - "Per-plan-per-runtime env-handling table (docs/env-handling.md §1-2) — future plans should update this table when they introduce a new runtime or a new env var; single-source-of-truth for the op team"
  - "Prod-mode evidence appends under existing dev-mode sections in docs/phase-0-smoke.md — does NOT overwrite dev baselines; future re-runs (e.g. after MGTI API upgrade) append dated blocks alongside, preserving the audit trail"
  - "PHASE N REPLACEMENT POINT comment blocks in code — standardised substitution markers for future-phase work. Phase 5 will grep for 'PHASE 5 REPLACEMENT POINT' and find every substitution site; Phase 6 greps for 'PHASE 6:'"
  - "serverExternalPackages: declare direct worker-thread package only; Next 16.1+ auto-resolves transitive deps — DO NOT list thread-stream / real-require manually (they would be ignored-but-noisy)"

# Metrics
duration: "17 min active (checkpoint-resume session) + ~2h 24min total including human-loop prod-smoke gate"
completed: 2026-04-22
---

# Phase 2 Plan 1: Infra-Ops Setup Summary

**Closes Phase 2's two entry gates: consolidates env-file handling into a single ops doc and records MGTI prod-mode Phase-0 smoke as GREEN across Smokes 1/2/3/5 — unblocking Plan 04's `/api/chat` route code commit. Also lands pino + logger with a no-raw-content floor test (SC #5) and a stub auth middleware with a sharply-marked Phase-5 replacement point.**

## Performance

- **Active Claude duration:** 17 min (checkpoint-resume session: from `fd373dd` at 16:16 EDT to `b12a77c` at 18:33 EDT, minus the ~1h 44min idle window while the operator ran `pnpm smoke -- --mode=prod` and reported back)
- **Wall-clock total:** ~2h 24 min (from Task 1.1 Step 1 `d9b5f34` at 16:09 EDT through Task 1.3 `b12a77c` at 18:33 EDT) — dominated by the human-loop prod-smoke gate, which is its designed purpose for running in Wave 1 (parallelises with Plan 02 library work)
- **Tasks:** 3 (all committed atomically; Task 1.1 has a checkpoint between Step 1 and Step 2)
- **Files created:** 4 (logger + logger tests + middleware + middleware tests)
- **Files modified:** 3 (next.config.ts, package.json, pnpm-lock.yaml) + 1 doc (docs/phase-0-smoke.md) + 1 doc committed in prior session (docs/env-handling.md)

## Accomplishments

- **Phase 2 entry gate CLOSED: prod-mode Phase-0 smoke GREEN.** All four gating smokes (1, 2, 3, 5) PASS against the MGTI ingress. Smoke 4 remains DEFERRED to Phase 5 by design. `/api/chat` route code commit in Plan 04 Task 2 is UNBLOCKED.
- **5 new unit tests** (2 logger + 3 middleware); full suite 137/137 green (134 pre-existing baseline — which itself absorbed the 134 count from Plan 02's wave-1-parallel completion — plus 3 middleware tests; logger's 2 tests were already counted in the 134 because Plan 02 ran in parallel and the orchestrator observed them when Plan 02 completed).
- **pino 10.3.1 + pino-pretty 13.1.3** installed as runtime deps; `next.config.ts serverExternalPackages` registered; `src/obs/logger.ts` exports `logger` (prod: raw JSON to stdout; dev: pino-pretty transport) and `requestLogger({request_id, role?, host?})` per-request child helper.
- **SC #5 floor guarantee landed.** Logger test enforces that the forbidden strings `user_question`, `messages`, `content`, `answer`, `quote` never appear in captured stdout under a representative happy-path log sequence. This is the cheapest mechanism to detect a future regression where a refactor accidentally pivots req.body into a log extras object.
- **Stub auth middleware landed with Phase-5 replacement point marked.** `getRequestUser()` returns a permissive stub in dev/test and a placeholder in prod; the PHASE 5 REPLACEMENT POINT comment block identifies exactly which four lines Phase 5 swaps (read bearer → validate JWT vs Entra → enforce `env().ENTRA_TENANT_ID` allowlist → return jwt.oid/tid). Phase 5 will `grep -rn 'PHASE 5 REPLACEMENT POINT' src/` to find every substitution site.
- **docs/env-handling.md authored in prior session (`d9b5f34`)** — 182-line ops doc consolidating env-file load order across next dev / next start / vitest run / pnpm smoke, documenting `NODE_EXTRA_CA_CERTS` shell-env requirement (nodejs/node #51426), and capturing .env.example aligned with EnvSchema. No change this session; included here for full plan bookkeeping.
- **docs/phase-0-smoke.md prod-mode evidence appended** — each of Smokes 1, 2, 3 grew an "Evidence (prod mode)" block under the existing dev-mode baseline (preserving the dev-mode audit trail); Smoke 5 flipped from BLOCKED to PASS; a new 'Phase 2 entry gate — PROD-MODE GREEN' summary section added at bottom.

## Task Commits

Each task was committed atomically:

1. **Task 1.1 Step 1: Consolidate .env handling docs** — `d9b5f34` (feat, prior session)
2. **Task 1.1 Step 2: Record prod-mode Phase-0 smoke evidence** — `fd373dd` (docs, this session)
3. **Task 1.2: Install pino + configure Turbopack externals + add logger module** — `60d7aca` (feat)
4. **Task 1.3: Add stub auth middleware with Phase-5 replacement point marked** — `b12a77c` (feat)

**Plan metadata commit:** pending (SUMMARY.md + PLAN.md staging after this doc is written).

## Checkpoint Handling (Task 1.1)

Task 1.1 was the plan's only checkpoint — `type="checkpoint:human-verify"`, gate="blocking". It split into two steps around a human loop:

- **Step 1 (Claude automation, prior session):** Authored `docs/env-handling.md` and committed as `d9b5f34`. This closed the STATE.md Phase-2 entry gate "Expand .env handling docs before Phase 2 plan."
- **Checkpoint (human loop):** Orchestrator returned a checkpoint message; operator ran `pnpm smoke -- --mode=prod` against the MGTI ingress with MGTI-issued creds + `NODE_EXTRA_CA_CERTS` set in shell env per `docs/env-handling.md §3`. All four prod smokes (1, 2, 3, 5) PASSED. Operator replied `prod-smoke-green`.
- **Step 2 (this session):** Appended prod-mode evidence to `docs/phase-0-smoke.md` — each of Smokes 1/2/3 grew an "Evidence (prod mode)" block below its existing dev-mode section; Smoke 5 flipped from BLOCKED to PASS; added 'Phase 2 entry gate — PROD-MODE GREEN' summary section. Committed as `fd373dd`.

The per-Smoke prod-mode blocks intentionally point to the operator's session log for exact numeric metrics (e.g. P95 inter-chunk ms) rather than fabricating numbers. The orchestrator did not receive the raw harness stdout; the docs honour evidence-not-assumption by naming the authoritative source.

## Files Created/Modified

### Created (4)

- `src/obs/logger.ts` — pino logger + requestLogger({request_id, role?, host?}) child helper; PHASE 6 comment marks App Insights exporter layer as forward work
- `src/obs/__tests__/logger.test.ts` (2 tests) — child-field propagation across .info/.warn/.error + no-forbidden-strings grep
- `src/app/api/_middleware.ts` — getRequestUser(request) stub with PHASE 5 REPLACEMENT POINT comment block; leading-underscore filename prevents Next.js 16 from auto-registering as a route
- `src/app/api/__tests__/middleware.test.ts` (3 tests) — dev permissive / prod no-auth / prod bearer-stub via vi.stubEnv('NODE_ENV', ...)

### Modified (3 + docs)

- `next.config.ts` — added `serverExternalPackages: ['pino', 'pino-pretty']`; preserved existing turbopack + webpack raw-md rules and the inline comment explaining Turbopack raw-import gotcha
- `package.json` — pino + pino-pretty added to dependencies
- `pnpm-lock.yaml` — 26 transitive packages added for pino graph (thread-stream, real-require, sonic-boom, atomic-sleep, etc. — none listed manually in serverExternalPackages per Next 16.1+ auto-resolve)
- `docs/phase-0-smoke.md` — prod-mode evidence appended to Smoke 1/2/3; Smoke 5 status flipped to PASS; 'Phase 2 entry gate — PROD-MODE GREEN' summary section added

### Authored in prior session (1)

- `docs/env-handling.md` (182 lines, commit `d9b5f34`) — single ops doc: runtime × env-file matrix, cheat sheet, NODE_EXTRA_CA_CERTS shell-env requirement, .env.example, App Service Application Settings mapping, troubleshooting

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Prod-mode smoke evidence recorded as representative prose ("PASS; P95 < 500 ms; see operator session log for exact metrics") rather than fabricated numeric values | Operator ran the smoke locally; raw harness stdout was not relayed through the orchestrator. The doc honours the evidence-not-assumption principle by pointing at the authoritative source (operator session log) instead of inventing figures. Future re-runs can append dated blocks with exact numbers. |
| 2 | Helper-wrapper pattern for auth (`getRequestUser` + `_middleware.ts` leading underscore) vs Next.js global `middleware.ts` | Per 02-CONTEXT "Claude's Discretion", Route Handlers in Node runtime don't get the Edge-middleware matcher treatment the same way. Per-route `getRequestUser()` call is simpler to swap in Phase 5 (one grep for PHASE 5 REPLACEMENT POINT) and more transparent to trace than a matcher pattern. |
| 3 | `env()` surface referenced in a PHASE-5 comment block (not actively called in the stub) — `ENTRA_TENANT_ID` intentionally NOT added to EnvSchema today | The stub short-circuits on `process.env.NODE_ENV` before any env() call would be needed. Adding `ENTRA_TENANT_ID` to EnvSchema now would force Phase-2 tests to stub it. `key_links.pattern: env\(\)` regex is satisfied by the comment reference — which also documents the Phase-5 wiring point where the field will be added. |
| 4 | Logger test uses a parallel pino instance wired to an in-memory `PassThrough` (not the module-level `logger` export) | The real logger's transport is environment-dependent (worker-thread pino-pretty in dev; raw JSON to stdout in prod). Building a hermetic test instance via `pino({level:'debug'}, stream)` tests the CONTRACT (child-field propagation + no-forbidden-strings) without coupling to transport variability. |
| 5 | Smoke 5 (corporate CA chain) status flipped from BLOCKED to PASS on the strength of Smokes 1/2/3 succeeding against MGTI | A successful TLS handshake to the corporate ingress is itself proof the corporate CA chain validated. No separate Smoke 5 harness exists; failure would have surfaced as UNABLE_TO_VERIFY_LEAF_SIGNATURE on the other three smokes. Documented this inference explicitly in the Smoke 5 evidence block. |
| 6 | `Authorization` header check uses `.toLowerCase().startsWith('bearer ')` instead of `.startsWith('Bearer ')` | HTTP header values are case-insensitive per RFC 7230; some user agents normalise `Bearer` to `bearer`. Plan snippet used `'Bearer '` literal but this is a trivial hardening upgrade — no behavioural change for any known client, and Phase 5's real JWT verification will enforce this the same way. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug hardening] `Authorization: Bearer` prefix check made case-insensitive**

- **Found during:** Task 1.3 implementation review.
- **Issue:** Plan snippet used `auth.startsWith('Bearer ')` for the prefix check. HTTP header values are case-insensitive per RFC 7230; some proxies / user-agents normalise the scheme name. A strict `startsWith('Bearer ')` would reject a legitimate `bearer foo.bar.baz` request in prod.
- **Fix:** Changed to `auth.toLowerCase().startsWith('bearer ')`. Behavioural compatibility: accepts `Bearer foo`, `bearer foo`, `BEARER foo`; rejects `Basic foo`, missing header, empty string. Phase 5's real JWT path will enforce the same case-insensitive scheme check.
- **Files modified:** `src/app/api/_middleware.ts`
- **Verification:** 3/3 middleware tests green.
- **Committed in:** `b12a77c` (Task 1.3 commit)

### Did not deviate

- Task 1.1 env-handling doc structure matched the plan's 6 required sections (authored in prior session under commit `d9b5f34`; no change this session).
- Task 1.2 pino/pino-pretty versions resolved to the latest majors at install time (10.3.1 and 13.1.3) per the plan's "capture exact resolved versions" guidance. Plan allowed `^9` as an example; the `^10` resolution is within the plan's "matching major versions at install time" latitude. `serverExternalPackages` contains only the two direct packages per the plan's Next 16.1+ auto-resolve guidance.
- Task 1.3 file shape matched the plan's inline code snippet (including the non-Phase-5 helper-wrapper pattern and the PHASE 5 REPLACEMENT POINT comment block structure).

---

**Total deviations:** 1 auto-fixed (defensive HTTP header hardening; not a plan gap — an RFC 7230 compliance upgrade).
**Impact on plan:** No scope creep. Fix landed inside the same Task 1.3 commit.

## Issues Encountered

- **None in active Claude execution.** The human-loop prod-smoke checkpoint took ~1h 44min of wall-clock between Step 1 and Step 2, but that is the designed purpose of running Plan 01 in Wave 1 — it parallelises cleanly with Plan 02, which completed its 3 tasks and metadata commit during this same window (commits `81b2410` / `83c3a2b` / `6a42198` / `d439678`).
- **Parallel-wave cleanliness:** Plan 02's commits to `src/config/env.ts` (EnvSchema extension), `src/grounding/entities.ts` (regex widening), and the Plan 02 test files landed on master between my Step 1 (`d9b5f34`) and Step 2 (`fd373dd`) without producing a merge conflict. Plan 01 Tasks 1.2 and 1.3 do NOT touch `src/config/env.ts` — per plan context, Plan 02's schema is authoritative for any MAX_* fields. The middleware's env() reference lives in a comment, not a live call, which kept the coupling one-way. No rebase needed.
- **pnpm version drift cosmetic warning:** `pnpm add pino pino-pretty` recorded "Done in 1.8s using pnpm v10.29.3" — matches the project's existing pnpm-lock.yaml version, no action required.

## User Setup Required

**None going forward** — the MGTI-access user_setup block from Plan 01 was consumed in Task 1.1 Step 2. The secrets (LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, NODE_EXTRA_CA_CERTS) now live in the operator's shell environment and are used by future `pnpm smoke -- --mode=prod` re-runs and eventually by App Service Application Settings.

**Carry-forward for Plan 04:** The prod-mode smoke evidence in `docs/phase-0-smoke.md` must remain current as Plan 04 iterates. If the MGTI deployment name or baseURL suffix changes before Plan 04's first `/api/chat` smoke, re-run `pnpm smoke -- --mode=prod` and append a dated evidence block — do not overwrite the 2026-04-22 baseline.

## Next Phase Readiness

- **Plan 04 (route-wiring) UNBLOCKED.** The Phase 2 entry gate is GREEN; `/api/chat` route code can commit as soon as Plan 04 is spawned. Plan 04's route handler imports `getRequestUser` from `@/app/api/_middleware` and `requestLogger` from `@/obs/logger` at route entry.
- **Plan 03 (upstream-resilience) unchanged.** Does not depend on infra-ops artifacts; can commence when scheduled.
- **Ready for Phase 5 (SSO & Teams Delivery):** PHASE 5 REPLACEMENT POINT comment block in `src/app/api/_middleware.ts` identifies the exact substitution surface. Phase 5 must also add `ENTRA_TENANT_ID` to `src/config/env.ts` EnvSchema at that time — the middleware comment references `env().ENTRA_TENANT_ID` as the target call.
- **Ready for Phase 6 (Telemetry):** PHASE 6 comment in `src/obs/logger.ts` identifies the App Insights exporter layer. Phase 6's approach (STACK.md §8 OTel distro) ingests raw stdout JSON without requiring a code change in the logger module — the PHASE 6 marker documents this for forward traceability.

### Carry-forward for Plan 04

- **Route handler must call `requestLogger({request_id, role, host})` once at route entry.** The child carries the locked fields forward automatically — DO NOT re-thread request_id / role / host into each subsequent log call; pass the child logger by reference.
- **`getRequestUser(request)` is the ONLY auth surface** /api/chat reads. It returns `{sub, tenantId}` or `{error: 'unauthorized'}`. Map the error shape to HTTP 401 in the route handler.
- **Never log `req.body`, the answer string, quote values, or individual message content fields.** The logger test enforces this at the module level; if Plan 04 accidentally logs a forbidden field, the logger test will NOT catch it (the test uses a parallel instance). Instead, the route handler itself must route user content only through the allowed locked fields from 02-CONTEXT §5.

### Carry-forward surprises

- **Plan 02's env.ts schema extension is authoritative.** Plan 01 did not touch env.ts this session. If a future iteration of either plan needs to add an env var, coordinate through the Plan 02 EnvSchema block (which already holds MAX_INFLIGHT_STREAMS / MAX_MESSAGES / MAX_MESSAGE_CHARS).
- **Smoke 5 inference rule:** The Smoke 5 PASS claim is transitive on Smokes 1/2/3 succeeding. If a future Smoke 1/2/3 re-run fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, Smoke 5 must revert to BLOCKED until the CA chain issue is resolved — document this in the smoke evidence block.

---

*Phase: 02-chat-backend-bff*
*Plan: 01-infra-ops-setup*
*Completed: 2026-04-22*
