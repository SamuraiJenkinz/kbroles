---
phase: 05-sso-and-teams-delivery
plan: 02
subsystem: infra
tags: [nextjs, health-check, error-surface, access-control, token-expired, ci-cd-smoke]

# Dependency graph
requires:
  - phase: 02-chat-backend-bff
    provides: ErrorCode wire contract, SseEvent shape, /api/config route
  - phase: 03-role-experience-and-chat-ui
    provides: ErrorCard + useConfig + ChatSurface call-site contracts
  - phase: 04-source-panel-trust-and-fallback-ui
    provides: Tailwind neutral-* / red-* / warning-* design tokens; useConfig contentStewardEmail source

provides:
  - "GET /api/health: Node-runtime canary endpoint (200 ok / 503 degraded) with env + MGTI HEAD checks"
  - "/access-denied: full-page wrong-tenant block with Content Steward mailto (leak-invariant enforced)"
  - "ErrorCode union extended with 'token_expired' 9th code (client-side)"
  - "ErrorCard renders 'Your session expired.' + 'Sign back in' CTA for token_expired"

affects: [05-03-middleware-jwt-validation, 05-04-auth-provider-redirect-bridge-signout, 05-05-teams-manifest-cicd-deploy]

# Tech tracking
tech-stack:
  added: []  # Zero new dependencies (lucide-react ShieldOff, AbortSignal.timeout are pre-existing)
  patterns:
    - "Health check pattern: env parse + upstream HEAD with AbortSignal.timeout(5s); reachable = status<500"
    - "Blocked-user UX invariant: test asserts no GUID-shaped strings + no tenant/JWT/token words in copy"
    - "Client-side ErrorCode extension ahead of server: widening flows through SseEvent.error shape for free"

key-files:
  created:
    - src/app/api/health/route.ts
    - src/app/api/health/__tests__/route.test.ts
    - src/app/access-denied/page.tsx
    - src/app/access-denied/__tests__/page.test.tsx
  modified:
    - src/chat-ui/types.ts
    - src/chat-ui/ErrorCard.tsx
    - src/chat-ui/__tests__/ErrorCard.test.tsx

key-decisions:
  - "Server-side src/chat/sse.ts ErrorCode NOT extended here — Plan 05-03 owns the server emit path"
  - "Mutable module-level mockConfigValue for access-denied test fallback case (vi.doMock post-import fails)"
  - "No exhaustiveness switch sites exist on errorCode — only ErrorCard.TITLE Record<ErrorCode,...> needed update"

patterns-established:
  - "Cache-Control: no-cache, no-store, must-revalidate on health endpoints (smokes MUST bypass all caches)"
  - "Leak-invariant test: expect(container.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i) for access-gated pages"
  - "Branched CTA pattern in ErrorCard: const primaryLabel = errorCode === '...' ? A : B (extensible for future codes)"

# Metrics
duration: 5m 37s
completed: 2026-04-23
---

# Phase 5 Plan 02: Health + Access-Denied + token_expired Summary

**/api/health canary (env + MGTI HEAD), /access-denied wrong-tenant page, and 'token_expired' 9th ErrorCode with 'Sign back in' CTA**

## Performance

- **Duration:** ~5 min 37 sec active
- **Started:** 2026-04-23T16:49:12Z
- **Completed:** 2026-04-23T16:54:49Z
- **Tasks:** 2 (both autonomous — no checkpoints)
- **Files created:** 4
- **Files modified:** 3

## Accomplishments

- **/api/health** ships the Plan-05-05 CI/CD smoke target: Node runtime, 200 ok / 503 degraded, env parse + MGTI HEAD (5s AbortSignal.timeout), `Cache-Control: no-cache, no-store, must-revalidate` on every response, no auth required. 401 counts as reachable (expected when hitting LLM_BASE_URL without a token).
- **/access-denied** delivers the full-page wrong-tenant block for Phase-5 middleware redirects: minimal Tailwind layout, lucide ShieldOff icon, mailto assembled from `useConfig().contentStewardEmail` with `kb-knowledge-team@mmc.com` as null-safe fallback. Leak-invariant test asserts zero GUID-shaped strings AND zero mentions of "tenant"/"JWT"/"token" in the visible copy.
- **`token_expired` 9th ErrorCode** extends the client wire type with a doc comment pointing at Plan 05-03 (server emit) and Plan 05-04 (MSAL CTA re-wire). `ErrorCard.TITLE` gained the 5th entry; primary CTA label branches to "Sign back in"; sub-copy branches to "Sign back in to continue — your question was not answered."; `onRetry` wiring stays identical so Plan 05-04 only needs to swap the ChatSurface call-site.

## Task Commits

Each task was committed atomically:

1. **Task 1: /api/health + /access-denied page** — `cf3a068` (feat)
2. **Task 2: token_expired 9th ErrorCode + Sign back in CTA** — `75117a1` (feat)

**Plan metadata:** appended below after STATE.md update.

## Files Created/Modified

- `src/app/api/health/route.ts` — GET handler with env + MGTI HEAD checks; 200/503 status + no-cache headers
- `src/app/api/health/__tests__/route.test.ts` — 6 tests covering all 4 env×mgti permutations + Cache-Control + Content-Type
- `src/app/access-denied/page.tsx` — client component, ShieldOff accent, mailto from useConfig
- `src/app/access-denied/__tests__/page.test.tsx` — 5 tests: heading, icon, mailto href, leak-invariant, null-config fallback
- `src/chat-ui/types.ts` — ErrorCode union extended with `'token_expired'` (9th member, doc-commented)
- `src/chat-ui/ErrorCard.tsx` — TITLE 5th entry, branched `primaryLabel` + `subCopy`
- `src/chat-ui/__tests__/ErrorCard.test.tsx` — 4 new `token_expired` describe-block tests + 5th it.each permutation

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Server-side `src/chat/sse.ts` ErrorCode NOT touched in this plan | Plan 05-03 owns the server-side `/api/chat` emit path. Client-side widening auto-flows through `SseEvent.error` without server changes. Keeping the two sides in separate commits means the server change commit can be reverted/rolled-forward independently of the client UI copy. |
| Mutable module-level `mockConfigValue` for the access-denied null-config fallback test | `vi.doMock('@/chat-ui/useConfig', …)` doesn't retroactively swap an ES-module reference that's already been imported at the top of the test file. The mutable-variable pattern keeps a single `vi.mock` factory at module load while letting individual tests flip the return value via `mockConfigValue = null` in the test body. Same reset pattern as existing `__resetConfigCacheForTests` calls in the parent test suite. |
| No exhaustiveness switch arms needed for `token_expired` | Repo-wide grep for `switch (errorCode` returns zero matches; `Record<ErrorCode, …>` returns exactly one site (`ErrorCard.TITLE`), which was updated. `chatReducer` treats `errorCode` as a pass-through stored field; `useChatStream` propagates the typed value without branching. No `'internal'`-mirror arms required. |
| ErrorCard grep check yields 4 matches not 2 | Plan's grep expectation ("two matches") under-counted. The plan prose explicitly required BOTH a branched `primaryLabel` AND a branched `subCopy`, which yields 3 real-code matches + 1 orientation comment = 4 total. The extra matches are load-bearing per the plan's own spec; not a deviation. |
| Health route tests mock `global.fetch` (not `vi.stubGlobal`) | Matches the direct-assignment pattern in existing route tests (`src/app/api/chat/__tests__/route.test.ts`); simpler teardown via `global.fetch = ORIGINAL_FETCH` in `afterEach`. |
| Leak-invariant regex uses `\btenant\b`/`\bJWT\b`/`\btoken\b` word boundaries | Prevents false positives from incidental substrings (e.g. "content steward" would match `/steward/` but not `/\btenant\b/`). The GUID prefix regex `[0-9a-f]{8}-[0-9a-f]{4}` covers both Entra `tid` and `oid` GUID shapes. |

## Deviations from Plan

None — plan executed exactly as written. All verification + success criteria pass.

Notes on grep assertions from the plan verify block:

- `src/chat-ui/types.ts` — grep `token_expired` returns 1 match (the identifier in the union). ✓ matches plan expectation.
- `src/chat-ui/ErrorCard.tsx` — grep `token_expired` returns 4 matches (TITLE entry + primaryLabel branch + subCopy branch + orientation comment). Plan said "two" but the prose explicitly required both branches, so 3 real code sites is the minimum; 4 total counts the doc comment. This is consistent with the plan's prose spec, and the plan grep count was just under-estimated. No deviation from the behavioural contract.

## Issues Encountered

- **Access-denied null-config test initially failed with `vi.doMock` pattern.** `vi.doMock('@/chat-ui/useConfig', …)` mocks DYNAMIC `import()` calls but does NOT swap references already imported at top-level (ES module bindings are cached per test file). Refactored to a mutable module-level `mockConfigValue` variable referenced inside the single `vi.mock` factory; each test flips the value before `render()`. All 5 tests pass.

## User Setup Required

None — no external service configuration required. Both new surfaces are pure-code additions; `/api/health` is reachable without credentials.

## Next Phase Readiness

**Ready for Plan 05-03** (middleware JWT validation). That plan will:

- Replace `src/app/api/_middleware.ts` Phase-2 stub with the Entra JWT + jose JWKS flow.
- Extend server-side `src/chat/sse.ts` ErrorCode with `'token_expired'` (mirrors the client extension this plan shipped).
- Wire `/api/chat` to emit `error{code:'token_expired'}` when a request hits mid-stream with an expired JWT.
- Extend the `/api/chat` single-log-per-request finally block with `jwt.oid`/`jwt.tid`/`jwt.preferred_username` fields (Phase-2 contract extension — unchanged by this plan).

**Ready for Plan 05-04** (auth provider + redirect bridge + sign-out). That plan will:

- Swap the ChatSurface call-site so ErrorCard's primary CTA, when `errorCode === 'token_expired'`, invokes `msalInstance.acquireTokenSilent()` → fallback `acquireTokenRedirect()`. ErrorCard itself stays unchanged.
- Redirect authenticated-but-wrong-tenant flows to `/access-denied` (shipped here).

**Ready for Plan 05-05** (Teams manifest + CI/CD). That plan will:

- Reference `/api/health` as the post-deploy canary smoke target in the GitHub Actions workflow. The endpoint MUST exist before the workflow references it — this plan ships it.

No blockers. Phase 2/3/4 test suites remain green (516 → 548 total unit tests with the 11 Task-1 + 5 Task-2 additions; the further 16 beyond my 21 are Plan 05-01 wave-1 parallel Task 1.x auth-foundation additions).

---
*Phase: 05-sso-and-teams-delivery*
*Completed: 2026-04-23*
