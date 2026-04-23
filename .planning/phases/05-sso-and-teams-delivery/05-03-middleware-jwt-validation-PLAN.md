---
phase: 05-sso-and-teams-delivery
plan: 03
type: execute
wave: 2
depends_on: ["05-01", "05-02"]
files_modified:
  - src/app/api/_middleware.ts
  - src/app/api/__tests__/_middleware.test.ts
  - src/app/api/chat/route.ts
  - src/app/api/chat/__tests__/route.test.ts
autonomous: true

must_haves:
  truths:
    - "`getRequestUser(request)` now (a) reads `Authorization: Bearer <token>` header, (b) validates JWT signature via `createRemoteJWKSet` + `jwtVerify` against Entra's tenant-scoped JWKS URL, (c) verifies `aud === env().ENTRA_CLIENT_ID` (bare GUID, NOT api://... — Pitfall 4), (d) verifies `iss === 'https://login.microsoftonline.com/${env().ENTRA_TENANT_ID}/v2.0'` (trailing /v2.0 required — Pitfall 6), (e) verifies `tid === env().ENTRA_TENANT_ID` (tenant allowlist — sole code-level gate), (f) returns `{sub: payload.oid, tenantId: payload.tid, preferredUsername: payload.preferred_username}` on success."
    - "On expired token (jose throws `ERR_JWT_EXPIRED`): returns discriminated `{error: 'token_expired'}`. On signature/audience/issuer/tid mismatch: returns `{error: 'unauthorized'}`. On wrong-tenant valid-sig: returns `{error: 'wrong_tenant'}` (distinct from unauthorized so Plan 04 routes the user to `/access-denied` vs sign-in)."
    - "Dev + test permissive path preserved: `NODE_ENV !== 'production'` AND missing Authorization header returns the Phase-2 `{sub:'local-dev', tenantId:'local-dev'}` stub — so existing Phase-2/3/4 route tests continue to pass without stubbing JWTs."
    - "JWKS endpoint is cached via `createRemoteJWKSet(url, { cooldownDuration: 300_000, cacheMaxAge: 86_400_000 })` — module-level singleton so concurrent requests share one cache (RESEARCH Pattern 4)."
    - "`/api/chat` returns a pre-stream 401 JSON response `{error:'token_expired'}` (Content-Type: application/json, NOT text/event-stream) when `getRequestUser` returns `{error:'token_expired'}`; returns 403 JSON `{error:'access_denied'}` when result is `{error:'wrong_tenant'}`; preserves existing 401 JSON `{error:'unauthorized'}` for the unauthorized case. No SSE frames are emitted for auth failures — the stream is never started."
    - "Single-log-per-request invariant preserved: `_middleware` DOES NOT call `log.info` itself; it returns a discriminated result that `/api/chat`'s existing finally-block `log.info(...)` records via a new `auth_result` key alongside the already-present `ingress_status_code` and `fallback_reason`. `jwt.oid`, `jwt.tid`, `jwt.preferred_username` are logged under these keys — operator visibility without leaking to the wire."
  artifacts:
    - path: "src/app/api/_middleware.ts"
      provides: "Real JWT validation replacing the Phase-2 stub; returns discriminated user|error result"
      exports: ["getRequestUser", "type AuthResult"]
    - path: "src/app/api/chat/route.ts"
      provides: "Route emits token_expired (401 pre-stream) and access_denied (403 pre-stream) based on auth result; preserves IIFE single-log-per-request"
      contains: "token_expired"
  key_links:
    - from: "src/app/api/_middleware.ts"
      to: "jose + env().ENTRA_TENANT_ID + env().ENTRA_CLIENT_ID"
      via: "createRemoteJWKSet + jwtVerify"
      pattern: "createRemoteJWKSet|jwtVerify"
    - from: "src/app/api/chat/route.ts"
      to: "src/app/api/_middleware.ts"
      via: "getRequestUser discriminated result → status code selection"
      pattern: "getRequestUser|token_expired"
    - from: "src/app/api/chat/route.ts"
      to: "401 JSON response body"
      via: "jsonError emits {error:'token_expired'} so the discriminant reaches the wire, not just a log key"
      pattern: "jsonError.*token_expired"
---

<objective>
Replace the Phase-2 `_middleware.ts` stub with the real Entra JWT validator using `jose`. The `PHASE 5 REPLACEMENT POINT` comment block in the current file documents the exact four-step transformation — this plan implements that verbatim plus two extras: the `token_expired` discriminant (9th error code) and the `wrong_tenant` discriminant (which routes to `/access-denied` instead of signin).

Purpose: The tenant allowlist is Phase 5's SOLE code-level gate (CONTEXT §Auth boundary). Without this plan, the browser-layer auth in Plan 04 can be bypassed by anyone calling `/api/chat` directly with a stolen token from another Entra tenant. This plan also emits the `token_expired` discriminant as a pre-stream 401 JSON response (NOT an SSE frame — the stream is never started for auth failures) that ErrorCard (Plan 02) renders and that Plan 04's `useChatStream` detects from `response.status` + JSON body before entering the SSE reader.

Phase-2 invariants (MUST be preserved):
- Dev/test permissive stub when Authorization header is absent AND `NODE_ENV !== 'production'`.
- Single `log.info` per request in `/api/chat`'s terminal finally block.
- IIFE pattern in `/api/chat` route untouched except where error codes are widened.
- UpstreamAuthError path (Pitfall 11) unchanged — that's the MGTI ingress auth break, separate from Entra auth.

Output:
- `src/app/api/_middleware.ts` replaces the stub body with `jose`-backed JWT validation (RESEARCH §Pattern 4). Preserves the exported `getRequestUser` signature with a widened return-type discriminant.
- `src/app/api/__tests__/_middleware.test.ts` — new test file. Uses `mock-jwks` + MSW pattern (RESEARCH §Test pattern) to synth JWKS + sign test tokens.
- `src/app/api/chat/route.ts` — swaps the early-return for the `token_expired` and `wrong_tenant` discriminants; adds `auth_result` key to the existing terminal `log.info(...)` call.
- `src/app/api/chat/__tests__/route.test.ts` extended with cases for the three new auth-fail paths.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05-sso-and-teams-delivery/05-CONTEXT.md
@.planning/phases/05-sso-and-teams-delivery/05-RESEARCH.md
@.planning/phases/05-sso-and-teams-delivery/05-01-auth-foundation-PLAN.md
@.planning/phases/05-sso-and-teams-delivery/05-02-health-access-denied-token-expired-PLAN.md

# Integration points
@src/app/api/_middleware.ts
@src/app/api/chat/route.ts
@src/app/api/chat/__tests__/route.test.ts
@src/config/env.ts
@src/obs/logger.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace _middleware.ts stub with jose-based JWT validator</name>
  <files>
    src/app/api/_middleware.ts,
    src/app/api/__tests__/_middleware.test.ts
  </files>
  <action>
Replace the entire body of `_middleware.ts` with the real validator. Preserve the exported `getRequestUser` name + basic shape, but widen the return type to a discriminated union. Four discriminants: `success | unauthorized | token_expired | wrong_tenant`.

**1. `src/app/api/_middleware.ts`:**

```typescript
/**
 * Phase-5 Entra ID JWT validator. Replaces the Phase-2 stub documented at
 * the top of this file previously. The PHASE 5 REPLACEMENT POINT block
 * described the four steps (a)-(d); this implementation fulfils them plus
 * adds token_expired / wrong_tenant discriminants for ErrorCard + access-
 * denied routing (CONTEXT §Blocked-user UX).
 *
 * Dev/test permissive stub preserved: when NODE_ENV !== 'production' AND
 * there is no Authorization header, accept any caller as 'local-dev'. This
 * keeps Phase 2/3/4 route tests working without JWT stubbing.
 *
 * Module name intentionally starts with underscore so Next.js 16 does NOT
 * auto-register it as a route (same invariant as Phase-2 stub).
 */
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose'
import { env } from '@/config/env'

export type AuthResult =
  | { sub: string; tenantId: string; preferredUsername?: string }
  | { error: 'unauthorized' }
  | { error: 'token_expired' }
  | { error: 'wrong_tenant' }

// JWKS is tenant-scoped in Entra v2. Cached module-level so concurrent
// requests share one in-memory cache. cooldownDuration prevents thundering-
// herd on key rotation; cacheMaxAge is 24h (RESEARCH Claude's Discretion
// window was 1h-24h; 24h is safe because Entra rotates rarely and JWKS
// supports multiple kids simultaneously during rotation).
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null
function getJwks() {
  if (_jwks) return _jwks
  const tid = env().ENTRA_TENANT_ID
  _jwks = createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${tid}/discovery/v2.0/keys`),
    { cooldownDuration: 300_000, cacheMaxAge: 86_400_000 },
  )
  return _jwks
}

/** Test-only. Forces a fresh JWKS on next call — required by the mock-jwks pattern below. */
export function __resetJwksForTests(): void {
  _jwks = null
}

export async function getRequestUser(request: Request): Promise<AuthResult> {
  // Dev/test permissive stub: no Authorization header AND non-production →
  // local-dev user. Production MUST have a Bearer token; the stub never
  // applies there.
  const auth = request.headers.get('authorization')
  if (process.env.NODE_ENV !== 'production' && !auth) {
    return { sub: 'local-dev', tenantId: 'local-dev' }
  }

  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return { error: 'unauthorized' }
  }
  const token = auth.slice('bearer '.length).trim()
  if (!token) return { error: 'unauthorized' }

  const { ENTRA_CLIENT_ID, ENTRA_TENANT_ID } = env()
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/v2.0`,  // Pitfall 6
      audience: ENTRA_CLIENT_ID,                                            // Pitfall 4 — bare GUID
      algorithms: ['RS256'],
      clockTolerance: 60,
    })

    // Tenant allowlist — sole code-level gate (CONTEXT §Auth boundary).
    // Distinct 'wrong_tenant' discriminant so the caller routes to
    // /access-denied instead of re-prompting for sign-in.
    if (payload.tid !== ENTRA_TENANT_ID) {
      return { error: 'wrong_tenant' }
    }

    const oid = typeof payload.oid === 'string' ? payload.oid : null
    const tid = typeof payload.tid === 'string' ? payload.tid : null
    if (!oid || !tid) return { error: 'unauthorized' }

    const preferredUsername =
      typeof payload.preferred_username === 'string'
        ? payload.preferred_username
        : undefined

    return { sub: oid, tenantId: tid, preferredUsername }
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return { error: 'token_expired' }
    }
    return { error: 'unauthorized' }
  }
}
```

**2. `src/app/api/__tests__/_middleware.test.ts`** — use `mock-jwks` + MSW per RESEARCH §Test pattern.

Skeleton (adapt exactly from RESEARCH §Code Examples):

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { setupServer } from 'msw/node'
import createJWKSMock from 'mock-jwks'
import { __resetEnvCacheForTests } from '@/config/env'
import { __resetJwksForTests, getRequestUser } from '../_middleware'

const TENANT = '11111111-2222-3333-4444-555555555555'
const CLIENT = '66666666-7777-8888-9999-aaaaaaaaaaaa'
const JWKS_URL = `https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`
const ISS = `https://login.microsoftonline.com/${TENANT}/v2.0`

// NOTE: createJWKSMock takes the BASE authority URL (no `/discovery/v2.0/keys` path suffix);
// the library appends the JWKS path internally. mock-jwks v3.x exports a default function —
// adjust to named import if the installed version's README shows that style.
const jwksMock = createJWKSMock(JWKS_URL.replace('/discovery/v2.0/keys', ''))
const server = setupServer(jwksMock.mswHandler)

beforeAll(() => {
  vi.stubEnv('NODE_ENV', 'production')  // disable dev permissive path
  vi.stubEnv('ENTRA_CLIENT_ID', CLIENT)
  vi.stubEnv('ENTRA_TENANT_ID', TENANT)
  server.listen()
})
afterAll(() => {
  server.close()
  vi.unstubAllEnvs()
})
beforeEach(() => {
  __resetEnvCacheForTests()
  __resetJwksForTests()
})

function makeRequest(authHeader?: string): Request {
  return new Request('https://example.test/api/chat', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
  })
}
```

Test cases (all REQUIRED):
1. **No Authorization header** → `{error:'unauthorized'}` (in prod mode).
2. **Malformed header** (`'Basic foo'`) → `{error:'unauthorized'}`.
3. **Valid JWT, correct tenant, correct audience** → success with sub/tenantId/preferredUsername populated from claims (`oid`/`tid`/`preferred_username`).
4. **Expired JWT** (`exp: Math.floor(Date.now()/1000) - 120`, clockTolerance is 60s → still expired) → `{error:'token_expired'}`.
5. **Wrong audience** (`aud: 'api://something-else'`) → `{error:'unauthorized'}` (jose throws JWTClaimValidationFailed).
6. **Wrong issuer** (missing `/v2.0` trailing) → `{error:'unauthorized'}`.
7. **Wrong tenant** (valid signature but `tid` = a DIFFERENT tenant GUID; still signed by same mock JWKS — acceptable because production would reject at signature step, but this covers the `tid !== ENTRA_TENANT_ID` branch directly):
   - Simulate by having `payload.tid = OTHER_TID` while signing under the real JWKS. `mock-jwks` supports a `overrides.iss / aud / tid` hash — if not, construct the token with `jwksMock.kid()` + a custom claim and sign with `mock-jwks`'s private key directly.
   - Result: `{error:'wrong_tenant'}`.
8. **Dev path still works**: stub NODE_ENV='test'; no Authorization header → `{sub:'local-dev', tenantId:'local-dev'}`. This is the regression guard that Phase 2/3/4 tests won't break.

For tests 3 and 4 use `jwksMock.token({ iss: ISS, aud: CLIENT, tid: TENANT, oid: 'user-oid-xyz', preferred_username: 'alice@mmc.com', exp: ... })`.

If `mock-jwks` API differs in practice, adapt by consulting its README — RESEARCH locks the library choice but the exact helper names may differ in v3.3. DO NOT switch to a different mock library; `mock-jwks` is chosen because it co-works with `jose` out of the box via MSW.
  </action>
  <verify>
`pnpm typecheck` clean. `pnpm test src/app/api/__tests__/_middleware.test.ts` — all 8 test cases green. Grep `supportsNestedAppAuth` still returns no matches. Grep `jwtVerify` in _middleware.ts returns one match.
  </verify>
  <done>
`_middleware.ts` validates real JWTs against Entra's JWKS. All four discriminant paths tested. Dev permissive path preserved. No changes to `/api/chat` yet — that's Task 2.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire token_expired + wrong_tenant responses into /api/chat</name>
  <files>
    src/app/api/chat/route.ts,
    src/app/api/chat/__tests__/route.test.ts
  </files>
  <action>
Wire the three new auth discriminants into `/api/chat`. Minimal, surgical — the IIFE pipeline, single-log invariant, and all Phase-2 pitfall coverage remain untouched.

**1. `src/app/api/chat/route.ts`** — two edits:

**Edit A — `getRequestUser` became async** (Task 1 changed its signature). Update the call-site:

```typescript
// OLD:
// const user = getRequestUser(request)
// if ('error' in user) { return jsonError('unauthorized', 401, ...) }

// NEW:
const user = await getRequestUser(request)
if ('error' in user) {
  if (user.error === 'token_expired') {
    return jsonError('token_expired', 401, { 'X-Request-Id': request_id })
  }
  if (user.error === 'wrong_tenant') {
    return jsonError('access_denied', 403, { 'X-Request-Id': request_id })
  }
  return jsonError('unauthorized', 401, { 'X-Request-Id': request_id })
}
```

**Edit B — single-log-per-request invariant**: the terminal `log.info(...)` in the IIFE finally-block must continue to fire once per request. Pre-stream auth failures DON'T enter the IIFE; they use the outer try/finally which releases the semaphore but does NOT emit a terminal log. That matches the Phase-2 behaviour for `parseChatRequest` failures and `rate_limited` 429s — all three land in the same "pre-stream error" family logged only via the outer `preStreamErr` catch if thrown.

Add a SINGLE `log.warn(...)` just before each of the three new auth-fail returns so operators have visibility without breaking the single-log-per-request rule (warn for auth failures is distinct from the terminal info for completed requests; existing Phase-2 tests already permit this — semaphore full path uses `log.warn`). Example:

```typescript
if (user.error === 'token_expired') {
  log.warn({ ingress_status_code: 401, auth_result: 'token_expired' }, 'chat auth failed')
  return jsonError('token_expired', 401, { 'X-Request-Id': request_id })
}
if (user.error === 'wrong_tenant') {
  log.warn({ ingress_status_code: 403, auth_result: 'wrong_tenant' }, 'chat auth failed')
  return jsonError('access_denied', 403, { 'X-Request-Id': request_id })
}
log.warn({ ingress_status_code: 401, auth_result: 'unauthorized' }, 'chat auth failed')
return jsonError('unauthorized', 401, { 'X-Request-Id': request_id })
```

NO changes to the IIFE. Do NOT emit a `token_expired` SSE frame from the IIFE pipeline — CONTEXT §Blocked-user UX says token expiry DURING a stream is handled by mid-stream detection, but the concrete mechanism is: `/api/chat` already short-circuits on auth fail PRE-STREAM. Mid-stream expiry would only happen if an MGTI call exceeded the JWT TTL, which is a 1-hour edge case outside v1 scope (RESEARCH + CONTEXT treat both paths as pre-stream because the client re-auths and replays — see Plan 04 ChatSurface wiring).

Successful auth: also add `auth_result: 'success'` to the existing terminal `log.info` block. Add the key next to `ingress_status_code` in the already-existing `log.info({...}, 'chat request completed')` call:

```typescript
log.info(
  {
    validator_flips: validatorFlips,
    refusal_fired: !!fallbackReason,
    fallback_reason: fallbackReason ?? null,
    ingress_status_code: ingressStatus,
    auth_result: 'success',    // NEW Phase-5 key
    sub: user.sub,             // NEW — jwt.oid; operator-only, never to wire
    // (preferredUsername and tenantId intentionally NOT logged in full to
    //  reduce PII footprint — sub alone is enough for operator correlation)
    prompt_tokens: usage?.prompt_tokens ?? null,
    completion_tokens: usage?.completion_tokens ?? null,
    ...(allowlistViolation ? { allowlist_violation: allowlistViolation } : {}),
    latency_ms: Date.now() - started,
  },
  'chat request completed',
)
```

CRITICAL: ensure the logger test in `src/obs/__tests__/logger.test.ts` still passes — that test locks the "no raw user-question text / no answer text / no quote text / no offending allowlist token" invariant. `sub` (oid GUID) is neither of those so should be acceptable, but run the test and adjust if it's a forbidden-substring match.

**2. `src/app/api/chat/__tests__/route.test.ts`** — add three new test cases:

1. **Expired JWT** → 401 with `{error: 'token_expired'}` body + `X-Request-Id` header. Mock `getRequestUser` via `vi.mock('@/app/api/_middleware', ...)` to return `{error:'token_expired'}`.
2. **Wrong tenant** → 403 with `{error: 'access_denied'}` body.
3. **Unauthorized** → 401 with `{error: 'unauthorized'}` body (regression coverage for the Phase-2 stub case that's now just the third discriminant).

Preserve ALL existing test cases. The previous 401 test (which exercised the Phase-2 stub's prod path) stays as-is with its mock behaviour — it just maps to the third discriminant now.
  </action>
  <verify>
`pnpm typecheck` clean. `pnpm test src/app/api/chat src/app/api/__tests__/_middleware src/obs` (all green including the logger forbidden-substrings test). Grep `token_expired` in src/app/api/chat/route.ts returns one match (the 401 early-return).
  </verify>
  <done>
`/api/chat` returns 401 `token_expired` on expired JWTs; 403 `access_denied` on wrong tenant; 401 `unauthorized` otherwise. Terminal `log.info` gains `auth_result` + `sub` keys. Phase-2 IIFE + single-log-per-request preserved for successful-auth path. All tests green.
  </done>
</task>

</tasks>

<verification>
- `pnpm typecheck` clean.
- `pnpm test` green (all ~535 existing + ~15 new tests in _middleware.test.ts + chat route test extensions).
- Grep `createRemoteJWKSet` in src/app/api/_middleware.ts returns exactly one match.
- Grep `getRequestUser` across repo: every call-site awaits the result (src/app/api/chat/route.ts is the only production caller; tests may mock).
- Logger forbidden-substrings test still green (proves no PII leak through the new `sub` / `auth_result` log keys).
- `curl -H 'Authorization: Bearer expired-jwt' http://localhost:3000/api/chat -X POST -d '{"role":"consumer","messages":[{"role":"user","content":"hi"}]}'` with NODE_ENV=production returns 401 `{error:'token_expired'}` (stub the jose verify failure locally via a malformed-exp test token — optional verification step; Playwright spec in Plan 04 may cover this end-to-end).
</verification>

<success_criteria>
- SC#1: non-MMC tenant token blocked at auth middleware (discriminant `wrong_tenant` → 403 `access_denied`).
- Token expiry produces `token_expired` error code on the wire — matches the `ErrorCode` union from Plan 02.
- Dev permissive path intact — Phase 2/3/4 route tests unchanged.
- Tenant allowlist is the sole code-level gate (CONTEXT §Auth boundary).
- Pitfall 4 (aud bare-GUID), Pitfall 6 (issuer /v2.0) locked by jose `jwtVerify` options + tests.
- JWKS cache singleton (Pattern 4) — no thundering-herd on key rotation.
</success_criteria>

<output>
After completion, create `.planning/phases/05-sso-and-teams-delivery/05-03-SUMMARY.md` noting:
- Exact `mock-jwks` API used (helper names may differ from the RESEARCH skeleton — record what worked).
- Any existing logger forbidden-substring test that needed adjustment + the rationale (e.g. `sub` added to allow-list).
- Test-delta count; total test count.
- Whether `clockTolerance: 60` was retained or adjusted (Claude's Discretion within sane bounds).
</output>
