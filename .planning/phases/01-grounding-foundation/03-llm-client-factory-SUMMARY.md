---
phase: 01-grounding-foundation
plan: 03
subsystem: llm
tags: [openai, ajv, zod, json-schema, dual-mode-auth, mgti-ingress, vitest]

# Dependency graph
requires:
  - phase: 01-01-scaffold-registry-schema
    provides: env() loadEnv() __resetEnvCacheForTests, CITATION_SCHEMA, KbResponse, STRICT_SCHEMA_SUPPORTED Zod field
provides:
  - createLlmClient() — single source of LLM_AUTH_MODE branching in the codebase (bearer + api-key)
  - streamAnswer() — non-streaming Phase-1 LLM call facade with json_schema strict + json_object/Ajv fallback paths
  - ChatMessage, StreamAnswerParams exported types
  - ajv moved from devDependencies to dependencies (runtime use in fallback path)
affects:
  - 01-05-phase0-smoke (smoke script consumes createLlmClient + streamAnswer end-to-end)
  - 02-api-chat-route (route handler wraps streamAnswer)
  - 02-streaming-sse (Phase 2 adds stream:true to the same facade)

# Tech tracking
tech-stack:
  added:
    - ajv@8.18.0 (promoted from devDep to dep)
  patterns:
    - "Dual-mode OpenAI SDK client factory — single place reading LLM_AUTH_MODE, zero NODE_ENV checks anywhere in codebase"
    - "Bearer mode: SDK Authorization header via apiKey field. Api-key mode: MGTI 'api-key' HTTP header via defaultHeaders, apiKey='placeholder' to satisfy SDK non-empty check"
    - "streamAnswer facade hides strict-mode-vs-json_object capability branching — callers always get KbResponse or throw"
    - "Zod-validated env flag (STRICT_SCHEMA_SUPPORTED enum) drives fallback default; typos like 'flase'/'False'/'0' fail fast at loadEnv()"
    - "Per-call strictSchemaSupported override for test determinism and operator debugging"
    - "Cached Ajv validator compiled once per process; reused across all streamAnswer calls"
    - "One retry on Ajv failure, then throw with both error messages chained — unrecoverable failures bubble to caller"
    - "Test mocking: vi.mock('openai') for the factory (constructor args captured); plain object client for streamAnswer (chat.completions.create params captured per call) — no vi.mock needed for the stream path"

key-files:
  created:
    - src/llm/client.ts
    - src/llm/stream.ts
    - src/llm/__tests__/client.test.ts
    - src/llm/__tests__/stream.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Ajv moved to dependencies (not devDependencies) because the json_object fallback path is production-gated by env().STRICT_SCHEMA_SUPPORTED — even though it only activates when MGTI doesn't honour strict mode, the code path is runtime and must resolve at import time in prod bundles"
  - "streamAnswer uses a plain-object mock client in tests (not vi.mock('openai')) — it only needs client.chat.completions.create to be a vi.fn(), so constructing the shape inline is simpler than mocking the whole SDK and gives per-call captured params directly"
  - "TypeScript cast in tests uses `as unknown as { _opts: ... }` (not `as any`) because tsc is strict — stricter casts satisfy both the type system and eslint if it lands later"

patterns-established:
  - "LLM call surface: every file that needs to talk to the LLM imports { createLlmClient, streamAnswer } from '@/llm/*' — no file ever constructs OpenAI directly"
  - "Fallback path gating: env flag is read via env().STRICT_SCHEMA_SUPPORTED (Zod-enum), not raw process.env. Per-call override via params.strictSchemaSupported takes precedence"
  - "Error message format for unrecoverable fallback failure: 'streamAnswer json_object fallback failed twice: {retry_err} (first: {first_err})' — both errors preserved so operators can diagnose"

# Metrics
duration: 3 min
completed: 2026-04-22
---

# Phase 1 Plan 03: LLM Client Factory Summary

**Dual-mode OpenAI SDK factory (bearer/api-key) + streamAnswer facade with json_schema-strict primary path and json_object+Ajv fallback path, both branches gated on Zod-validated env().STRICT_SCHEMA_SUPPORTED with typo-safe enum validation.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-22T17:15:13Z
- **Completed:** 2026-04-22T17:18:22Z
- **Tasks:** 5 (3.1 factory, 3.2 facade, 3.3 factory tests, 3.4 facade tests, 3.5 full suite green)
- **Files created:** 4 (2 source, 2 test)
- **Files modified:** 2 (package.json, pnpm-lock.yaml — ajv promoted to dep)

## Accomplishments

- `createLlmClient()` is the single source of LLM_AUTH_MODE branching in the codebase — bearer mode uses SDK Authorization header; api-key mode sends MGTI's `api-key` HTTP header via `defaultHeaders` and sets `apiKey: 'placeholder'` to satisfy the SDK's non-empty check. No NODE_ENV anywhere (GRND-06 invariant).
- `streamAnswer()` non-streaming Phase-1 facade with both branches implemented: primary path uses `response_format: json_schema` with `strict: true`; fallback path uses `response_format: json_object` + cached Ajv validator + one retry + structured throw message preserving both errors. Branch selection: `params.strictSchemaSupported ?? (env().STRICT_SCHEMA_SUPPORTED !== 'false')` — per-call param wins, else env default.
- Zod-validated env flag means typos like `'flase'`, `'False'`, `'0'` throw at `loadEnv()` with `/Invalid env/` — explicitly tested. Operators flipping the flag in App Service Settings get immediate feedback if they mistype.
- Ajv promoted from devDependencies to dependencies. `pnpm list ajv --depth 0` confirms `dependencies: ajv 8.18.0`.
- 13 new tests added (5 client + 8 stream) — all 48 tests across 6 suites pass (`pnpm test`), typecheck clean (`pnpm tsc --noEmit`), zero NODE_ENV references in production source, zero raw `process.env.STRICT_SCHEMA_SUPPORTED` reads in `src/llm/stream.ts`.
- Pitfall #11 (ingress auth break) primary mitigation locked in — the factory's one branch point is the single failure surface, and the env contract fails fast on misconfiguration.

## Task Commits

Each task was committed atomically:

1. **Task 3.1: createLlmClient factory** — `b71c924` (feat)
2. **Task 3.2: streamAnswer facade + ajv promotion** — `92b3634` (feat)
3. **Task 3.3: Client factory tests** — `991dcc3` (test)
4. **Task 3.4: streamAnswer tests** — `d9bdcb1` (test)
5. **Task 3.5: Full-suite verification** — no commit (verification-only; plan metadata commit captures plan closure)

**Plan metadata commit:** _(captures this SUMMARY.md and STATE.md — hash assigned at plan closure)_

## Files Created/Modified

### Created

- `src/llm/client.ts` — `createLlmClient()` factory. 35 LOC. Single auth-mode branch. Bearer: SDK Authorization header via `apiKey` field. Api-key: MGTI `api-key` header via `defaultHeaders`, `apiKey: 'placeholder'`.
- `src/llm/stream.ts` — `streamAnswer(params)` + `ChatMessage` + `StreamAnswerParams` exports. Non-streaming Phase-1 facade. Primary path: json_schema strict. Fallback path: json_object + Ajv + one retry. Cached Ajv validator (module-scope). Env flag via `env().STRICT_SCHEMA_SUPPORTED` only.
- `src/llm/__tests__/client.test.ts` — 5 cases: bearer mode (assert apiKey from env, no defaultHeaders), api-key mode (assert apiKey='placeholder', defaultHeaders['api-key']=env-key), missing LLM_AUTH_MODE throws, invalid LLM_AUTH_MODE throws, empty LLM_API_KEY throws. `vi.mock('openai')` captures constructor args via `_opts`.
- `src/llm/__tests__/stream.test.ts` — 8 cases: primary path sends json_schema + schema match (1), system prompt prepended (1), fallback sends json_object (1), fallback retries-then-succeeds (1), fallback throws-after-two (1), env default → strict (1), env=false → fallback (1), Zod typo 'flase' rejected at loadEnv (1).

### Modified

- `package.json` — ajv moved from `devDependencies` → `dependencies` (runtime use in fallback path).
- `pnpm-lock.yaml` — ajv graph moved accordingly; no new transitive deps added.

## Decisions Made

1. **Ajv is a runtime dependency, not a dev dependency.** The json_object fallback path is gated on an env flag that operators flip in MGTI App Service Settings after Smoke 2. Because the code path is production-reachable, ajv must be in `dependencies` so prod bundles resolve it at import. Even though it's dormant in the common strict-mode case, "devDep that ships in prod" is semantically wrong and confuses Next.js's tree-shaker. `pnpm remove ajv && pnpm add ajv` reordered the lockfile cleanly.
2. **Mock strategy split.** For `client.ts` I used `vi.mock('openai')` because the SUT constructs `new OpenAI(opts)` and I need to inspect those opts. For `stream.ts` I used a plain object with `client.chat.completions.create = vi.fn(async ...)` because the SUT only needs a client shape, not the SDK's behaviour. Plain mock is simpler, gives direct access to captured call params, and avoids hoisting surprises.
3. **Stricter test casts.** Tests use `as unknown as { _opts: Record<string, unknown> }` instead of `as any`. Both compile, but the former declares intent ("I know this is the mock shape") and survives future stricter linting. No functional difference.
4. **No per-file streamAnswer test isolation of the Ajv cache.** The module-scope `cachedValidator` is lazily initialised on first fallback call. Tests that exercise fallback in sequence share the same compiled validator — this is intentional; recompiling Ajv per test would hide a real-world resource-reuse bug. The cache is idempotent per-schema, so it's safe.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ajv did not move devDep→dep on first `pnpm add`**

- **Found during:** Task 3.2 (after pnpm add ajv)
- **Issue:** The first `pnpm add ajv` reported "Already up to date" and left ajv in `devDependencies`. pnpm treats an existing entry (even in devDependencies) as satisfying the request. The plan's Task 3.2 verification explicitly requires `pnpm list ajv` to show it as a prod dependency.
- **Fix:** Ran `pnpm remove ajv` followed by `pnpm add ajv`. The remove cleared the devDep entry; the re-add placed it in dependencies. package.json and pnpm-lock.yaml now show ajv under `dependencies`.
- **Files modified:** `package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm list ajv --depth 0` output shows `dependencies: ajv 8.18.0`. No devDep entry for ajv remains.
- **Committed in:** `92b3634` (Task 3.2 commit)

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The pnpm "already up to date" behaviour is a known quirk; the fix is standard (remove + add). No scope creep. The plan's remediation guidance ("run `pnpm add ajv` to reorder the file idempotently") didn't anticipate that pnpm would short-circuit on an existing devDep entry.

## Issues Encountered

None beyond the deviation above. No authentication gates. No checkpoints. No network. No test-runner weirdness. The wave-2 parallel plans (02 and 04) committed concurrently without conflict — only Plan 03 touched `package.json`/`pnpm-lock.yaml`, so Plans 02 and 04 had no overlap.

## User Setup Required

None — this plan is pure library code. The env values it depends on (`LLM_API_KEY`, `LLM_BASE_URL`, etc.) are declared in `.env.example` (from Plan 01) but not needed until Plan 05 runs the live smoke. All tests mock the SDK and inject env via `process.env` in test setup.

## Next Phase Readiness

- **Ready for Plan 05 (phase0-smoke):** `createLlmClient()` and `streamAnswer()` are importable from `@/llm/*`. The smoke script can construct a client once and call `streamAnswer` repeatedly for each of the 5 resolutions. The strict-mode-vs-json_object capability branch is in-process and decided by env flag, so Smoke 2's only job is to determine which flag value is correct — the code path already handles both.
- **Ready for Phase 2 (`/api/chat` route):** Route handler will call `createLlmClient()` once at module scope (SDK is thread-safe per-request via the SDK's internal HTTP pool) and call `streamAnswer` per request. Phase 2's streaming (GRND-07) will add a new `streamAnswerSSE` that mirrors this facade but with `stream: true` and SSE parsing — the non-streaming `streamAnswer` remains for internal tests and smokes.
- **Blockers/concerns:**
  - Smoke 2's outcome will determine whether `STRICT_SCHEMA_SUPPORTED=true` (default, strict path) or `STRICT_SCHEMA_SUPPORTED=false` (fallback path with Ajv) is the prod-correct setting. Both paths are tested and ready; operator flips one env var.
  - Phase-0 smoke blockers (baseURL suffix, streaming cadence, Entra consent, CA chain, App Service provisioning, Content Steward) carry forward unchanged — addressed in Plan 05.
  - Wave 2 parallel execution worked cleanly: Plan 02 delivered `validateCitations`, Plan 03 delivered the LLM client surface, Plan 04 delivered role preludes/common rules/few-shots (visible in git log). Plan 05 consumes all three.

---
*Phase: 01-grounding-foundation*
*Completed: 2026-04-22*
