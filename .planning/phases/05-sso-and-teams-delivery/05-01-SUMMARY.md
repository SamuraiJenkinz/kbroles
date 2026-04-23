---
phase: 05-sso-and-teams-delivery
plan: 01
subsystem: auth
tags: [msal, entra, teams-js, naa, jose, sso, session-storage]

# Dependency graph
requires:
  - phase: 02-chat-backend-bff
    provides: "src/config/env.ts EnvSchema (extended here with ENTRA_* keys)"
  - phase: 04-source-panel-trust-and-fallback-ui
    provides: "clean typecheck + test baseline (516 unit, 19 E2E)"
provides:
  - ".npmrc node-linker=hoisted (Pitfall 10 block removed for Plan 05-05 deploy)"
  - "EnvSchema.ENTRA_CLIENT_ID + ENTRA_TENANT_ID (optional + dev default)"
  - "src/auth/detectHost.ts — Promise.race host detection (150ms timeout, memoised)"
  - "src/auth/msalConfig.ts — MSAL Configuration + DEFAULT_SCOPES"
  - "src/auth/msalInstance.ts — singleton getMsalInstance() via createNestablePublicClientApplication (NAA-ready)"
affects: [05-02-health-access-denied-token-expired, 05-03-middleware-jwt-validation, 05-04-auth-provider-redirect-bridge-signout, 05-05-teams-manifest-cicd-deploy]

# Tech tracking
tech-stack:
  added:
    - "@azure/msal-browser@5.8.0 (prod)"
    - "@azure/msal-react@5.3.1 (prod)"
    - "@microsoft/teams-js@2.52.0 (prod)"
    - "jose@6.2.2 (prod)"
    - "mock-jwks@3.3.5 (dev)"
  patterns:
    - "pnpm hoisted linker for Next.js standalone compatibility"
    - "NEXT_PUBLIC_* (browser-inlined) + server-side duplicate per Next.js conventions"
    - "Module-memoised Promise.race detection primitives (zero-alloc repeat calls)"
    - "Singleton async factory with in-flight promise dedupe"
    - "SSR-guarded browser-only modules (typeof window checks + hard error on server import)"

key-files:
  created:
    - ".npmrc"
    - "src/auth/detectHost.ts"
    - "src/auth/msalConfig.ts"
    - "src/auth/msalInstance.ts"
    - "src/auth/__tests__/detectHost.test.ts"
    - "src/auth/__tests__/msalConfig.test.ts"
    - ".planning/phases/05-sso-and-teams-delivery/05-01-SUMMARY.md"
  modified:
    - "package.json"
    - "pnpm-lock.yaml"
    - "src/config/env.ts"
    - "src/config/__tests__/env.test.ts"
    - ".env.example"

key-decisions:
  - "@azure/msal-browser resolved 5.8.0 (minor-newer than plan-locked 5.6.3); within major 5 per plan escape hatch, no API rearrangement observed"
  - "navigateToLoginRequestUrl removed from msalConfig — field dropped from MSAL v5 BrowserAuthOptions type; default capture-state behaviour is equivalent"
  - "storeAuthStateInCookie removed from msalConfig — field dropped from MSAL v5 CacheOptions type (IE11-era fallback); evergreen sessionStorage sufficient"
  - "Added third detectHost test case for initialize() REJECT (not just hang); Pitfall 2 mitigation still works via .catch()"
  - "Added SSR-fallback redirectUri test ('/auth/redirect' when typeof window === 'undefined') to lock module-load safety"
  - "Pre-existing Plan 05-02 ErrorCard/types.ts edits in working tree were NOT staged — left for Plan 05-02 executor (parallel-wave discipline)"

patterns-established:
  - "Deviation doc-in-code: when library drift forces a code change, document in-file AND in SUMMARY (not just commit message)"
  - "pnpm node-linker=hoisted is authoritative project-wide for Next.js 16 standalone tracer"

# Metrics
duration: 5m 33s
completed: 2026-04-23
---

# Phase 5 Plan 01: Auth Foundation Summary

**MSAL v5 NAA-ready singleton + @microsoft/teams-js host detection + Entra env keys — everything Plans 05-02 through 05-05 import.**

## Performance

- **Duration:** 5m 33s active
- **Started:** 2026-04-23T16:48:41Z
- **Completed:** 2026-04-23T16:54:14Z
- **Tasks:** 2
- **Files modified:** 11 (5 created, 5 modified, 1 summary)

## Accomplishments

- Five Phase-5 dependencies installed at the versions locked in RESEARCH §Stack (with one minor drift accepted; no major drift observed).
- `.npmrc` node-linker=hoisted — Pitfall 10 pre-empted for Plan 05-05 Azure App Service `next build` standalone deploy.
- EnvSchema extended with `ENTRA_CLIENT_ID` + `ENTRA_TENANT_ID` (optional + dev placeholder default so Phase 2/3/4 tests pass without stubbing; production middleware enforces real values via JWT verify).
- `detectHost()` ships with four test cases (teams resolve, browser 150ms timeout, initialize-reject fallback, memoisation) — covering RESEARCH Pattern 3 exactly.
- `getMsalInstance()` uses the correct MSAL v5 NAA entry point (`createNestablePublicClientApplication`), NOT the removed `supportsNestedAppAuth: true` config flag. Confirmed via Node introspection of the installed `@azure/msal-browser@5.8.0` exports.
- Anti-pattern greps return zero matches for both blocked patterns (`supportsNestedAppAuth`, `microsoftTeams.getAuthToken`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Entra/MSAL deps + .npmrc + EnvSchema** — `8bf2998` (chore)
2. **Task 2: detectHost primitive + MSAL singleton** — `ca833e6` (feat)

**Plan metadata:** _pending_ — committed after this SUMMARY + STATE.md update are staged (see final commit below).

_Note: there is a non-05-01 commit `cf3a068 feat(05-02): add /api/health canary + /access-denied page` sitting between the two 05-01 commits. That was produced by a parallel Plan 05-02 execution (wave-2 independent work) and is unrelated to this plan._

## Files Created/Modified

- **`.npmrc`** — pnpm hoisted linker config. Rationale: pnpm's default isolated `node_modules/.pnpm` symlink tree is not followed by Next.js's standalone tracer, which would result in the Plan 05-05 Azure deploy shipping a bundle missing transitive deps. Hoisted linker produces a flat `node_modules/` that the tracer handles correctly.
- **`src/auth/detectHost.ts`** — Runtime host detection via `Promise.race([microsoftTeams.app.initialize().then(→'teams'), timeout(150ms).then(→'browser')])`. Result memoised at module-level; test-only reset exported. Handles both "initialize hangs" (Pitfall 2, teams-js issue #719) and "initialize rejects" cases.
- **`src/auth/msalConfig.ts`** — `Configuration` object with `clientId` + `tenantId` read from `NEXT_PUBLIC_ENTRA_*` env vars (defaulting to `'dev-only-do-not-use-in-prod'` placeholder). `authority = https://login.microsoftonline.com/${tid}` (NO trailing `/v2.0` — MSAL appends internally; the JWT issuer in Plan 03 is the `/v2.0` form because that's the claim). `cacheLocation: 'sessionStorage'`. `redirectUri` + `postLogoutRedirectUri` SSR-guarded with `typeof window !== 'undefined'`. `DEFAULT_SCOPES = ['openid','profile','email','User.Read']`.
- **`src/auth/msalInstance.ts`** — Singleton `getMsalInstance()` calling `createNestablePublicClientApplication(msalConfig)` (MSAL v5 NAA factory; auto-falls-back to standard `PublicClientApplication` outside Teams). In-flight promise dedupe so concurrent callers await the same initialization. Hard error on server context (`typeof window === 'undefined'`).
- **`src/auth/__tests__/detectHost.test.ts`** — 4 tests: teams resolve, browser timeout, initialize-reject fallback, memoisation (initialize called exactly once across repeat calls).
- **`src/auth/__tests__/msalConfig.test.ts`** — 7 tests: authority shape + no /v2.0 suffix, sessionStorage cache, DEFAULT_SCOPES content + length, tenant/client id env-var plumbing via `vi.stubEnv`, dev-default fallback when env unset, SSR redirectUri fallback.
- **`src/config/env.ts`** — EnvSchema extended with `ENTRA_CLIENT_ID` + `ENTRA_TENANT_ID` (both `z.string().min(1).optional().default('dev-only-do-not-use-in-prod')`). Multi-paragraph comment documents the split from `NEXT_PUBLIC_ENTRA_*` (same GUID values, two keys, different visibility per Next.js conventions).
- **`src/config/__tests__/env.test.ts`** — 5 new tests in `describe('env — Phase-5 Entra ID SSO (Plan 05-01 Task 1)')`: defaults for both keys, custom-value flow-through, empty-string rejection for both keys.
- **`.env.example`** — Appended 8-line Phase-5 block with placeholder GUIDs for all four keys (NEXT_PUBLIC_ENTRA_CLIENT_ID, NEXT_PUBLIC_ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_TENANT_ID) and inline comment explaining the NEXT_PUBLIC_* / server-side split.
- **`package.json` / `pnpm-lock.yaml`** — +4 prod deps, +1 dev dep. Full versions recorded below.

### Final installed versions (from `pnpm list`)

| Package | Plan target | Installed | Notes |
|---|---|---|---|
| `@azure/msal-browser` | `^5.6.3` | `5.8.0` | Minor-newer; accepted per plan escape hatch (no major drift) |
| `@azure/msal-react` | `^5.3.1` | `5.3.1` | Exact |
| `@microsoft/teams-js` | `^2.52.0` | `2.52.0` | Exact |
| `jose` | `^6.2.2` | `6.2.2` | Exact |
| `mock-jwks` (dev) | unpinned | `3.3.5` | Pinned latest at install time |

## Decisions Made

| # | Decision | Rationale |
|---|---|---|
| 1 | Accepted `@azure/msal-browser@5.8.0` over the plan-locked `^5.6.3` | Minor-newer within major 5; plan explicitly permits minor drift. Verified `createNestablePublicClientApplication` still exported at the expected path via `node -e "require('@azure/msal-browser').createNestablePublicClientApplication"` — no API rearrangement. |
| 2 | Removed `navigateToLoginRequestUrl: true` from msalConfig | MSAL v5's `BrowserAuthOptions` type does NOT expose this field (removed between v3→v5). MSAL's default behaviour after `handleRedirectPromise()` is to restore the original request URL from state, so the absent flag is functionally equivalent to `true` but type-safe. In-file comment documents the drop. |
| 3 | Removed `storeAuthStateInCookie: false` from msalConfig | MSAL v5's `CacheOptions` type does NOT expose this field (IE11-era cookie-fallback was deleted with the v5 evergreen-only pivot). Defaulting to sessionStorage is the same observable behaviour. In-file comment documents the drop. |
| 4 | Added a third detectHost test — `initialize()` rejection path | Pitfall 2 talks about the hang case only, but the module's `.catch()` handler exists specifically for the reject case (e.g. ChannelError). Adding the test locks the safety-net behaviour; Plan 05-04 AuthProvider can rely on detectHost never throwing. |
| 5 | Added SSR-fallback redirectUri test | The module is designed to be safe-to-import from a server component (doesn't throw on load, only on `getMsalInstance()`). This test locks the `'/auth/redirect'` fallback so a future refactor can't silently break SSR imports. |
| 6 | Did NOT stage pre-existing uncommitted Plan 05-02 edits | When I started Task 2, the working tree had `src/chat-ui/ErrorCard.tsx`, `src/chat-ui/__tests__/ErrorCard.test.tsx`, and `src/chat-ui/types.ts` modifications implementing the `token_expired` 9th error code. These are Plan 05-02 content (a parallel wave-2 plan). Per atomic-commit discipline, left them for the Plan 05-02 executor to commit under its own plan header. |
| 7 | Per-task atomic commits with body documenting the MSAL v5 drift deviation | Consistent with Plan 01/02/03/04 precedent; each task independently revertable; deviation rationale lives both in-file AND in commit message for provenance. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Library drift] MSAL v5 dropped `navigateToLoginRequestUrl` and `storeAuthStateInCookie` from its typed Configuration**

- **Found during:** Task 2 (post-write `pnpm typecheck`)
- **Issue:** Plan's msalConfig snippet was authored against MSAL v3/v4. Applying it to `@azure/msal-browser@5.8.0` produced two `error TS2353: Object literal may only specify known properties` errors on `BrowserAuthOptions` and `CacheOptions`.
- **Fix:** Removed both keys. MSAL v5's defaults provide equivalent behaviour (auto-restore request URL on redirect; sessionStorage-only cache since evergreen browsers only). Added multi-line in-file comments in `src/auth/msalConfig.ts` explaining the drop so future readers don't assume oversight.
- **Files modified:** `src/auth/msalConfig.ts`, `src/auth/__tests__/msalConfig.test.ts` (removed the two assertions that would have failed anyway and replaced with an SSR-fallback test for coverage parity).
- **Verification:** `pnpm typecheck` clean; 7/7 msalConfig tests green; `createNestablePublicClientApplication` still the NAA entry point (unchanged).
- **Committed in:** `ca833e6` (Task 2 commit).

---

**Total deviations:** 1 auto-fixed (Rule 1 library-drift).
**Impact on plan:** Purely a mechanical adjustment to match MSAL v5's typed surface. No scope creep; no behavioural change versus plan intent. Equivalent defaults preserve the security model (sessionStorage cache, state-capture redirect).

## Issues Encountered

- **Pre-existing uncommitted Plan 05-02 edits in working tree.** When I began Task 2, `git status` showed `src/chat-ui/ErrorCard.tsx`, `src/chat-ui/__tests__/ErrorCard.test.tsx`, and `src/chat-ui/types.ts` with Plan 05-02 `token_expired`-9th-code edits already applied but not yet committed. The accompanying feat commit `cf3a068` was made by the parallel Plan 05-02 agent during my execution window. Those three files remain uncommitted (three new tests absorbed into the full-suite baseline but not tied to my plan commits). I deliberately left them untouched — not my plan's content, not my commits to make.

## User Setup Required

Planned: Entra App Registration (MMC IT). The plan's `user_setup.entra-app-registration` block identifies the redirect URIs, admin-consent scopes, and pilot cohort Enterprise-Application assignment. These must be provisioned before Plan 05-03 middleware can validate real JWTs end-to-end. Plan 05-01 itself does NOT require live Entra credentials — dev defaults (`'dev-only-do-not-use-in-prod'`) let tests pass.

See plan `05-01-auth-foundation-PLAN.md` frontmatter `user_setup.entra-app-registration.dashboard_config` for the exact dashboard steps.

## Next Phase Readiness

**UNBLOCKED for wave 2:**
- **Plan 05-02** (health + access-denied + token_expired): `env().ENTRA_*` available; can import `getMsalInstance()`/`detectHost()` if needed for a future health probe. (Plan 05-02 appears to have executed in parallel based on `cf3a068` commit + working-tree residue; executor should fold the detected residue into its own commit flow.)
- **Plan 05-03** (middleware JWT validation): `jose@6.2.2` installed; `ENTRA_CLIENT_ID` + `ENTRA_TENANT_ID` readable via `env()`; PHASE-5 REPLACEMENT POINT in `src/app/api/_middleware.ts` ready for substitution.
- **Plan 05-04** (AuthProvider + redirect bridge + signout): `@azure/msal-react@5.3.1` installed; `getMsalInstance()` singleton ready; `DEFAULT_SCOPES` authoritative.
- **Plan 05-05** (Teams manifest + CI/CD deploy): `.npmrc` hoisted linker ensures `next build --output standalone` will not silently drop transitive deps on Azure App Service.

**Concerns:**
- MSAL v5 `navigateToLoginRequestUrl` equivalence depends on MSAL's internal state-capture still behaving as documented. Plan 05-04 E2E should assert that after a successful redirect sign-in, the user lands back on the URL they started at (not `/`). If that breaks, reinstate via `onRedirectNavigate` callback rather than the dropped flag.
- The `createNestablePublicClientApplication` factory is async (returns a Promise). This is WHY `getMsalInstance()` is async — downstream consumers in Plan 05-04 AuthProvider must `await` before passing the instance to `MsalProvider`. Budgeted in the plan; worth calling out.
- Pre-existing Plan 05-02 residue in working tree (ErrorCard/types.ts) is Plan 05-02 executor's responsibility to commit. If Plan 05-02's SUMMARY already reports that commit, the residue may be a post-commit second-round edit.

---
*Phase: 05-sso-and-teams-delivery*
*Completed: 2026-04-23*
