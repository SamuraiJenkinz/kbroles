---
phase: 05-sso-and-teams-delivery
plan: 03
subsystem: auth
tags: [jose, jwt, jwks, entra, msal, token-expired, wrong-tenant, mock-jwks, msw]

# Dependency graph
requires:
  - phase: 05-01-auth-foundation
    provides: "jose@6.2.2 + mock-jwks@3.3.5 (dev) deps; env().ENTRA_CLIENT_ID + ENTRA_TENANT_ID with dev defaults; .npmrc node-linker=hoisted"
  - phase: 05-02-health-access-denied-token-expired
    provides: "Client-side ErrorCode 9th code 'token_expired'; /access-denied page + leak-invariant; ErrorCard 'Sign back in' CTA branch"
provides:
  - "AuthResult discriminated union: success | unauthorized | token_expired | wrong_tenant"
  - "Real JWT validator at src/app/api/_middleware.ts using createRemoteJWKSet + jwtVerify"
  - "Tenant allowlist enforcement (Phase-5 sole code-level gate per CONTEXT §Auth boundary)"
  - "/api/chat routes token_expired→401, wrong_tenant→403 access_denied, unauthorized→401 pre-stream JSON"
  - "Terminal log.info gains auth_result + sub keys (operator correlation; logger forbidden-substrings invariant preserved)"

affects: [05-04-auth-provider-redirect-bridge-signout, 05-05-teams-manifest-cicd-deploy]

# Tech tracking
tech-stack:
  added: []  # All deps already landed in Plan 05-01 (jose + mock-jwks)
  patterns:
    - "createRemoteJWKSet module-scoped singleton with cooldownDuration 300s + cacheMaxAge 24h (Pattern 4)"
    - "Discriminated AuthResult union — caller branches on .error for status-code selection"
    - "Dev/test permissive path guarded by NODE_ENV + absent Authorization header (Phase 2/3/4 regression guard)"
    - "Pre-stream auth failures emit log.warn (distinct from single terminal log.info for streamed-completion path)"
    - "mock-jwks URL-shape discipline: base must trailing-slash, path must NOT leading-slash (new URL resolution semantics)"
    - "Test-mock pass-through wrapper pattern: vi.mock factory with authOverride slot defaults null → delegates to vi.importActual (existing tests keep real code path)"

key-files:
  created:
    - "src/app/api/__tests__/_middleware.test.ts"
    - ".planning/phases/05-sso-and-teams-delivery/05-03-SUMMARY.md"
  modified:
    - "src/app/api/_middleware.ts"
    - "src/app/api/chat/route.ts"
    - "src/app/api/chat/__tests__/route.test.ts"
  deleted:
    - "src/app/api/__tests__/middleware.test.ts"  # Phase-2 stub test, structurally incompatible with real validator

key-decisions:
  - "Retained clockTolerance: 60s — plan-recommended window; balances Entra's typical clock-skew allowance against token-reuse exposure"
  - "JWKS cacheMaxAge: 24h — Entra rotates keys rarely (weeks+) and JWKS serves multiple kids during rotation; 24h is safe upper bound from the research's 1h-24h range"
  - "mock-jwks start() thunk over custom setupServer(mswHandler) — msw isn't hoisted under pnpm's hoisted linker (transitive dep of mock-jwks stays in .pnpm store); start() works because mock-jwks' internal msw resolution is self-contained"
  - "vi.hoisted authOverride slot pattern in chat route tests — preserves real code-path coverage for existing prod-no-header test while injecting discriminants for new tests without dispatching real JWTs through a second mock-jwks instance"
  - "Per-task atomic commits (2 feat) with body documenting mock-jwks URL-shape discovery; each task independently revertable"
  - "sub (jwt.oid GUID) added to terminal log.info — explicit in-file comment locks rationale (not raw user content, so forbidden-substrings invariant stays green; no change needed to logger test)"
  - "Deleted Phase-2 middleware.test.ts — its prod-stub assertion is structurally incompatible with the real validator; replacing it wholesale is cleaner than rewriting"

patterns-established:
  - "URL-shape discipline for test-time JWKS mocks: new URL(path, base) has absolute-path semantics — document and enforce at the test-file level"
  - "Async getRequestUser with discriminated error branches — future auth-adjacent helpers should follow the same shape rather than throw"

# Metrics
duration: ~9 min
completed: 2026-04-23
---

# Phase 5 Plan 03: Middleware JWT Validation Summary

**Real Entra JWT validator via jose + createRemoteJWKSet replacing the Phase-2 stub, with token_expired + wrong_tenant discriminants wired to /api/chat's 401/403 pre-stream JSON paths.**

## Performance

- **Duration:** ~9 min active
- **Started:** 2026-04-23T17:04:30Z (approx — parallel with Plan 05-04)
- **Completed:** 2026-04-23T17:13:00Z (approx)
- **Tasks:** 2 (both autonomous, no checkpoints)
- **Files created:** 1 (+ SUMMARY)
- **Files modified:** 3
- **Files deleted:** 1

## Accomplishments

- **`_middleware.ts` validator** replaces Phase-2 stub. `getRequestUser` is now async; returns a four-way discriminated `AuthResult`. JWKS is cached singleton (cooldownDuration 300_000, cacheMaxAge 86_400_000) so concurrent requests share one HTTP lookup. Pitfall 4 (bare-GUID aud) + Pitfall 6 (issuer /v2.0 trailing) locked by jose `jwtVerify` options. Tenant allowlist enforced as the sole code-level gate. Dev-permissive path preserved for Phase 2/3/4 regression.
- **9 new tests in `_middleware.test.ts`** using `mock-jwks@3.3.5` + its built-in MSW integration via the `start()` thunk. All four discriminants (success, unauthorized, token_expired, wrong_tenant) exercised, plus two explicit guards for Pitfall 4 (wrong audience) and Pitfall 6 (issuer missing /v2.0), plus the dev-permissive regression check.
- **`/api/chat` route** translates the three new auth-fail discriminants into pre-stream JSON responses (`token_expired` → 401; `wrong_tenant` → 403 `access_denied`; `unauthorized` → 401) each with an accompanying `log.warn` distinct from the terminal `log.info`. Successful-auth path gains `auth_result: 'success'` + `sub: user.sub` (jwt.oid GUID for operator correlation) in the terminal log without breaking the forbidden-substrings invariant.
- **4 new chat-route tests** inject discriminants via a `vi.hoisted` override slot that defaults to pass-through, so the existing prod-no-header → 401 regression test keeps exercising the real validator code path.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace _middleware.ts stub with jose-based JWT validator** — `f0925be` (feat)
2. **Task 2: Wire token_expired + wrong_tenant responses into /api/chat** — `677f7bf` (feat)

**Plan metadata:** _pending_ — committed after this SUMMARY + STATE.md update are staged.

## Files Created/Modified

- **`src/app/api/_middleware.ts`** — Replaced the Phase-2 stub body (`PHASE 5 REPLACEMENT POINT` comment block retired). Now imports `createRemoteJWKSet`, `jwtVerify`, and `errors` from `jose`. Module-level `_jwks` cache via `getJwks()` helper; `__resetJwksForTests()` exported so each test case can flip the env tenant guid and bootstrap a fresh cache. `getRequestUser(request): Promise<AuthResult>` — dev-permissive path first, bearer-token parsing, then `jwtVerify` with issuer + audience + algorithms + clockTolerance options. Tid allowlist runs after signature/issuer/audience verify. `JWTExpired` → `token_expired`; all other verify errors → `unauthorized`; tid mismatch → `wrong_tenant`.
- **`src/app/api/__tests__/_middleware.test.ts`** (new) — 9 tests across two describe blocks. First block stubs NODE_ENV=production + LLM_* env + ENTRA_* env, creates a `createJWKSMock(base-with-trailing-slash, path-without-leading-slash)` + starts the MSW handler via `start()`. Covers no-header, malformed-header, empty-bearer, valid-JWT, expired-JWT, wrong-audience, wrong-issuer, wrong-tenant. Second block overrides NODE_ENV back to 'test' and exercises the dev-permissive path.
- **`src/app/api/chat/route.ts`** — `await getRequestUser(request)`. Three `if ('error' in user)` sub-branches each call `log.warn({ingress_status_code, auth_result}, 'chat auth failed')` then `jsonError(code, status, {'X-Request-Id': request_id})`. Terminal `log.info` body extended with `auth_result: 'success'` and `sub: user.sub`. In-file multi-paragraph comments lock the rationale (PII minimisation, forbidden-substrings invariant, single-log-per-completed-request preservation).
- **`src/app/api/chat/__tests__/route.test.ts`** — Added `authOverride: {value: any}` slot to the `vi.hoisted` mocks block. Wrapped `_middleware` in a `vi.mock` factory that delegates to `vi.importActual` unless the override is set. `beforeEach` resets the override to null. Added a new describe block with 4 tests for the three error discriminants + the success-auth terminal-log field assertion.
- **`src/app/api/__tests__/middleware.test.ts`** (deleted) — Phase-2 stub test; its `'prod-stub'` user assertion is structurally incompatible with the real validator. Wholesale replacement was cleaner than rewrite.

## Decisions Made

| # | Decision | Rationale |
|---|---|---|
| 1 | Retained plan's `clockTolerance: 60s` | Balances Entra's typical clock-skew allowance against token-reuse exposure window. Plan recommended; I made the expired-JWT test exp=now-120s so the 60s tolerance still classifies it as expired. |
| 2 | `cacheMaxAge: 86_400_000` (24h) for JWKS | Entra rotates keys rarely (weeks+) and JWKS serves multiple kids during rotation windows. Research said 1h-24h; 24h is the safer upper bound given the thundering-herd cost of every middleware instance refetching on shared cache eviction. |
| 3 | Used mock-jwks' built-in `start()` thunk over a custom `setupServer(mswHandler)` pattern | **msw is NOT hoisted under pnpm's `.npmrc node-linker=hoisted`** — msw is a transitive dep of mock-jwks and stays in `.pnpm/msw@2.13.5_...`. `require('msw/node')` from project root fails. However, mock-jwks' internal `start()` uses its nested msw resolution, which works because the module's own resolver finds its own nested copy. The MSW interceptors intercept global fetch regardless of which physical msw instance initialised them. Simpler test code + zero dependency-layout brittleness. |
| 4 | URL-shape discipline in tests: base with trailing `/`, path without leading `/` | **Hit this as a live bug during Task 1 verification:** `new URL('/discovery/v2.0/keys', 'https://login.microsoftonline.com/tenant-guid')` resolves to `https://login.microsoftonline.com/discovery/v2.0/keys` (tenant segment dropped — absolute-path semantics). The `createRemoteJWKSet` call in `_middleware.ts` hits the correct tenant-scoped URL, but the mock-jwks handler was intercepting a different URL. Initially 3 tests failed at signature-verify because fetch hit the real Entra endpoint and got `AADSTS90002: Tenant not found`. Fix: use `'.../tenant-guid/'` (trailing slash) + `'discovery/v2.0/keys'` (no leading slash). Inline comment in test file locks this for future maintainers. |
| 5 | `vi.hoisted` authOverride slot in chat route tests instead of per-test `vi.doMock` | `vi.doMock` swaps dynamic `import()` resolution but NOT the static top-level `import { getRequestUser } from '@/app/api/_middleware'` already bound in route.ts. The mutable-slot pattern defaults to pass-through (delegates to `vi.importActual`) so the existing prod-no-header → 401 regression test keeps exercising the real validator. Inject-override-or-pass-through keeps the test matrix honest. |
| 6 | Deleted Phase-2 `middleware.test.ts` rather than updating it | The prior test asserted `{sub:'prod-stub', tenantId:'prod-stub'}` which the real validator cannot produce. Updating in-place to the new discriminants would leave a filename (`middleware.test.ts` without underscore) inconsistent with the underscore-prefixed module under test. New `_middleware.test.ts` name matches the module and covers a superset of cases. Atomic net-negative LoC footprint in the task's commit. |
| 7 | `sub` (jwt.oid) added to terminal `log.info` without updating logger forbidden-substrings allow-list | Logger test locks FIELD NAMES (`user_question`, `messages`, `content`, `answer`, `quote`). `sub` is not in that list; a GUID value is not substring-matched against any forbidden keyword. Ran the forbidden-substrings test after the change — still green. No logger-test adjustment needed. Recorded the reasoning in an in-file comment on the `log.info` call site so future edits maintain the invariant. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] mock-jwks URL resolution drops tenant segment when path has leading `/`**

- **Found during:** Task 1 (running new `_middleware.test.ts`)
- **Issue:** Initial test layout used `JWKS_BASE = '.../tenant-guid'` + `JWKS_PATH = '/discovery/v2.0/keys'`. `new URL(path, base)` inside mock-jwks' `createJWKSMock` treats the leading-slash path as absolute, resolving to `.../discovery/v2.0/keys` and dropping the tenant. Three tests failed because `createRemoteJWKSet` in `_middleware.ts` hits the correct tenant-scoped URL but the mock handler was registered at the tenant-less URL, so fetch leaked to the real Entra endpoint and got `AADSTS90002: Tenant not found`.
- **Fix:** Switched to `JWKS_BASE = '.../tenant-guid/'` (trailing slash) + `JWKS_PATH = 'discovery/v2.0/keys'` (no leading slash). Multi-line inline comment locks this for future maintainers. Verified by running all 9 _middleware tests green.
- **Files modified:** `src/app/api/__tests__/_middleware.test.ts`
- **Verification:** 9/9 tests green after fix.
- **Committed in:** `f0925be` (Task 1 commit).

---

**2. [Rule 3 — Blocking] getRequestUser became async; chat/route.ts's sync call and its tests break immediately**

- **Found during:** Transition from Task 1 to Task 2 (when I ran `pnpm test src/app/api/chat` after committing Task 1 ideas but before writing Task 2 code)
- **Issue:** Task 1's Promise-returning signature change immediately breaks the existing `'Issue #3: 401 (unauthorized in prod) releases the slot immediately'` test in route.test.ts — without `await`, `user` is a Promise so `'error' in user` is always true, but the existing code `return jsonError('unauthorized', ...)` works by accident. However the *status code* was 200 because the Promise is still pending and route proceeds into the stream. Any transition where Task 1 landed without Task 2 would fail this test.
- **Fix:** Implemented Task 2 immediately after Task 1's tests passed, before running the full suite. Committed atomically as one task per plan precedent (not a mega-commit) so each task retains its own history entry. If only commit A were reverted, the old stub would restore and Task 2's `await` would still resolve on the sync stub (no-op) — behaviour degrades gracefully.
- **Files modified:** `src/app/api/chat/route.ts`
- **Verification:** Full chat/route.test.ts suite green (30/30) after Task 2 wire-up.
- **Committed in:** `677f7bf` (Task 2 commit).

---

**Total deviations:** 2 auto-fixed (1 test-layout bug, 1 inter-task-ordering blocker).
**Impact on plan:** No scope creep; no behavioural change versus plan intent. Deviation 1 was purely a test-harness URL-resolution discovery; deviation 2 was a sequencing annotation rather than a change.

## Issues Encountered

- **pnpm hoisted linker and msw visibility.** `.npmrc node-linker=hoisted` from Plan 05-01 hoists DIRECT deps but NOT transitive-only ones. `msw` is a transitive dep of `mock-jwks` (not a direct project dep), so it remains in `.pnpm/msw@2.13.5_...` and is unreachable from the project root via `require('msw/node')`. The RESEARCH skeleton called for `setupServer(jwksMock.mswHandler)` from `msw/node`; this would require adding msw as an explicit devDependency. Avoided by using mock-jwks' built-in `start()` thunk, which resolves msw via its own nested node_modules. This keeps the dependency footprint minimal (no additional msw in package.json) and works transparently because MSW interceptors act on global fetch regardless of which msw instance initialised them. Documented inline in the test file.
- **`jose.errors.JWTExpired` prototype check works across version/implementation boundaries.** `jose` v6.2.2 exports the `errors` namespace with discrete error subclasses; `err instanceof joseErrors.JWTExpired` is the documented pattern. Verified by inspecting `node_modules/jose/dist/types/util/errors.d.ts` before committing — `JWTExpired extends JOSEError implements JWTClaimValidationFailed`, so the instanceof narrows correctly.
- **Parallel Plan 05-04 files in working tree.** When running the full test suite, `src/chat-ui/__tests__/ChatSurface.test.tsx` showed 13 failures. Verified these are Plan 05-04's in-flight work by stashing Plan 05-04's modified files (`ChatSurface.tsx`, `ChatPage.tsx`, `Header.tsx`, `useChatStream.ts`, `ChangeRoleDialog.tsx`, `Header.test.tsx`) and re-running — all 563 tests green without them. Confirmed my plan's files (scoped to `src/app/api/*`) don't interact with chat-ui code. Left Plan 05-04's working-tree residue untouched per parallel-wave discipline.
- **mock-jwks v3.3.5 API exports.** The package is authored as CJS with a `__esModule` interop flag. Named imports work under Vitest's Vite-backed module resolution (ESM-like, but with `__esModule` detection) but NOT under raw `node` ESM (which treats CJS as default-only). Verified the named `{ createJWKSMock }` import pattern works inside Vitest tests — confirmed by the green test run.

## mock-jwks API reference (for future maintainers)

```typescript
import { createJWKSMock } from 'mock-jwks'

const mock = createJWKSMock(
  'https://authority.example.com/tenant-guid/',  // MUST trailing-slash
  'discovery/v2.0/keys',                          // MUST NOT leading-slash
)

const stop = mock.start()   // registers MSW handler via mock-jwks' internal
                            // setupServer + listen({onUnhandledRequest:'bypass'})
const token = mock.token({  // signs RS256 JWT with local PKI; payload is JwtPayload
  iss: 'https://authority.example.com/tenant-guid/v2.0',
  aud: 'client-guid',
  tid: 'tenant-guid',
  oid: 'user-guid',
  exp: Math.floor(Date.now()/1000) + 3600,
  // preferred_username, iat, etc all allowed
})
// mock.kid() — current key id; mock.mswHandler — handler to attach to your
// own MSW instance if you'd rather not call start().

stop()  // tears down
```

## Test-delta + invariants

- **New tests:** 13 (9 in `_middleware.test.ts` + 4 in chat route.test.ts)
- **Removed tests:** 3 (in deleted `middleware.test.ts`)
- **Net delta:** +10 tests
- **Total non-UI tests:** 507 (was 497-ish before this plan on the same subset)
- **Forbidden-substrings logger test:** Green. `sub` + `auth_result` keys do not match any forbidden field name; GUID values don't collide with forbidden content tokens.
- **Anti-pattern greps:** Zero matches for both `supportsNestedAppAuth` and `microsoftTeams.getAuthToken`.
- **Typecheck:** Clean (`pnpm typecheck` → zero errors).

## User Setup Required

None in this plan — the dev-permissive path continues to let local dev run without real Entra credentials. Plan 05-01's frontmatter `user_setup.entra-app-registration` block remains the authoritative provisioning task for MMC IT; with that registration live, the real validator enforces tenant + audience + issuer end-to-end.

## Next Phase Readiness

**Ready for Plan 05-04** (already running in parallel — wave 2 peer):
- `AuthResult` discriminated union is the contract Plan 05-04's `useChatStream` + `ChatSurface` will branch on when reading `response.status` + JSON body (401 `token_expired` → MSAL `acquireTokenRedirect`; 403 `access_denied` → navigate to `/access-denied`; 401 `unauthorized` → generic retry).
- `/api/chat`'s pre-stream JSON discriminants are distinct from its SSE `error` frames, so Plan 05-04's client code MUST check `response.status` + `Content-Type: application/json` BEFORE entering the SSE reader. That precedent is already set by Phase-2's `rate_limited` (429) + `unauthorized` (401) paths.

**Ready for Plan 05-05** (Teams manifest + CI/CD deploy):
- `/api/chat` now enforces real Entra auth in production; deploy-readiness gate met.
- `/api/health` (Plan 05-02) remains unauthenticated — the CI/CD smoke can still hit it without Entra credentials.

**Concerns:**
- Plan 05-04's `useChatStream` must handle the `token_expired` 401 JSON body BEFORE attempting to read the SSE stream. If the client reads `response.body` before checking status, it'll try to parse SSE from a JSON body and hang. Plan 05-02 noted this as a Plan 05-04 contract; worth re-flagging here.
- Mock-jwks URL-shape gotcha should be documented in a test-helpers README or inline in any future test file that mocks other JWKS URLs (e.g. if a second identity provider is added). The fix is local-to-this-test-file today but the pattern is general.
- Clock skew between the running container and the authority is the clockTolerance=60s bound. If pilots report intermittent `token_expired` errors correlating with clock drift, the fix is to extend to 300s (Entra's default allowance) — requires code edit + redeploy, not a runtime knob. Consider promoting to env knob in a future plan if operational data warrants.

---
*Phase: 05-sso-and-teams-delivery*
*Completed: 2026-04-23*
