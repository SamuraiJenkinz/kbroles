---
phase: 05-sso-and-teams-delivery
plan: 04
subsystem: auth
tags: [msal, entra, teams-naa, nextjs-app-router, redirect-bridge, token-provider, signout, e2e-fixture]

# Dependency graph
requires:
  - phase: 05-sso-and-teams-delivery
    plan: 01
    provides: "getMsalInstance singleton + DEFAULT_SCOPES + detectHost"
  - phase: 05-sso-and-teams-delivery
    plan: 02
    provides: "/access-denied page + token_expired ErrorCode + Sign back in CTA"
  - phase: 05-sso-and-teams-delivery
    plan: 03
    provides: "middleware JWT validation + /api/chat 401 (token_expired|unauthorized) + 403 (access_denied) + wrong_tenant discriminants"

provides:
  - "src/auth/tokenProvider.ts — host-aware acquireToken(account?) + signOut()"
  - "src/app/providers.tsx — client-only AuthProvider wrapping MsalProvider"
  - "src/app/auth/redirect/page.tsx + layout.tsx — COOP redirect bridge + fragment-passthrough nested layout"
  - "src/chat-ui/ChatPage.tsx — auth-gated render (inProgress|unauth|wrong-tenant branches)"
  - "src/chat-ui/useChatStream.ts — acquireToken + onTokenExpired + onAccessDenied DI options; pre-stream 401/403 branching"
  - "src/chat-ui/ChatSurface.tsx — Bearer header DI, sign-out flow, token_expired retry carries fresh token"
  - "src/chat-ui/Header.tsx — Sign out popover option (optional onSignOut prop)"
  - "src/chat-ui/ChangeRoleDialog.tsx — parameterised with optional title/description/confirmLabel/cancelLabel"
  - "tests-e2e/fixtures/mockMsal.ts — stubMsalAuthenticated(page) Playwright helper"

affects: [05-05-teams-manifest-cicd-deploy]

# Tech tracking
tech-stack:
  added: []  # Zero new dependencies
  patterns:
    - "Client-only AuthProvider via useEffect + getMsalInstance() async; server components never import MSAL"
    - "Fragment-passthrough nested layout for COOP redirect bridge (App Router Pitfall 7 guard)"
    - "DI boundary for auth into hooks: acquireToken passed into useChatStream as optional callback, not imported at top-level (keeps Phase-3 unit tests MSAL-free)"
    - "Host-aware token acquisition: browser silent → redirect; Teams silent → popup (iframe constraint — RESEARCH open-question #2 correction)"
    - "Pre-stream HTTP status + JSON body contract for auth discriminants (NOT SSE frames — Plan 05-03 contract lock)"
    - "E2E test-only bypass flag (window.__E2E_MSAL_TOKEN__) avoids seeding MSAL credential entities in Playwright specs"
    - "Dialog component parameterisation over structural duplication for sign-out confirm"

key-files:
  created:
    - src/auth/tokenProvider.ts
    - src/auth/__tests__/tokenProvider.test.ts
    - src/app/auth/redirect/layout.tsx
    - src/app/auth/redirect/page.tsx
    - tests-e2e/fixtures/mockMsal.ts
    - .planning/phases/05-sso-and-teams-delivery/05-04-SUMMARY.md
  modified:
    - src/app/providers.tsx
    - src/chat-ui/ChatPage.tsx
    - src/chat-ui/ChatSurface.tsx
    - src/chat-ui/Header.tsx
    - src/chat-ui/ChangeRoleDialog.tsx
    - src/chat-ui/useChatStream.ts
    - src/chat-ui/__tests__/Header.test.tsx
    - src/chat-ui/__tests__/ChatSurface.test.tsx
    - tests-e2e/chat-happy-path.spec.ts
    - tests-e2e/controls-stop-new-change.spec.ts
    - tests-e2e/copy-and-feedback.spec.ts
    - tests-e2e/fallback-and-flag-gap.spec.ts
    - tests-e2e/keyboard-and-error-retry.spec.ts
    - tests-e2e/role-contamination.spec.ts
    - tests-e2e/role-select.spec.ts
    - tests-e2e/source-panel-first-citation.spec.ts
    - tests-e2e/source-panel-footer-and-badges.spec.ts
    - tests-e2e/source-panel-updates-and-chip-reopen.spec.ts
    - tests-e2e/trust-header-and-about-tooltip.spec.ts

key-decisions:
  - "redirect-bridge subpath export IS present in @azure/msal-browser@5.8.0 — verified against package.json 'exports' field + dist/redirect-bridge/redirect_bridge/index.d.ts. No fallback needed."
  - "ChangeRoleDialog parameterised with optional title/description/confirmLabel/cancelLabel rather than creating SignOutDialog.tsx sibling — smaller diff, zero behavioural change for existing call-sites."
  - "access_denied handled via useChatStream onAccessDenied callback (ChatSurface does router.replace) rather than extending ErrorCode union — avoids ErrorCard TITLE entry churn AND matches UX (user leaves chat surface; never sees a red card)."
  - "useChatStream uses Option-A DI (hook accepts optional acquireToken callback) — no top-level @/auth/tokenProvider import at the hook layer so existing Phase-3 unit tests stay MSAL-free."
  - "E2E fixture uses a test-only window.__E2E_MSAL_TOKEN__ bypass in tokenProvider.ts instead of seeding MSAL idToken credential entities — credential entity format is complex (generateCredentialKey 8-tuple) AND specs don't actually need real JWT structure since /api/chat is network-mocked."
  - "Wrong-tenant gate in ChatPage explicitly no-ops when ALLOWED_TENANT === 'dev-only-do-not-use-in-prod' so local dev + test env don't false-positive."
  - "Playwright fixture account-key format adapted to MSAL v5.8.0 after initial drift: correct format is `msal.3|<home>|<env>|<tenant>` (pipe-separated lowercase) with `msal.3.account.keys` as the list pointer. Schema version 3 is ACCOUNT_SCHEMA_VERSION; pipe is CACHE_KEY_SEPARATOR."
  - "Two test suites broke temporarily on my first pass (ChatPage useRouter not mounted; ChatSurface auth mock gap). Fixed Rule 3-style with module-level vi.mock() for next/navigation, @azure/msal-react, @/auth/tokenProvider at the top of ChatSurface.test.tsx."

patterns-established:
  - "App Router nested layout override for client-side-only segments: fragment-passthrough layout fully replaces parent Providers wrap (does NOT wrap it). Must NOT emit <html>/<body>."
  - "MSAL v5 NAA + Teams: silent → popup (NOT redirect). Teams tabs are iframes; acquireTokenRedirect navigates the parent Teams window, not the tab."
  - "Pre-stream auth discriminant pattern: 401 body.error in {token_expired, unauthorized} + 403 body.error in {access_denied, wrong_tenant}. SSE stream is never started for auth failures."
  - "Playwright MSAL stub: pipe-separated account key (msal.3|<home>|<env>|<tenant>) + msal.3.account.keys pointer + window.__E2E_MSAL_TOKEN__ bypass. Inline script so init ordering is stable (addInitScript stacks)."

# Metrics
duration: 14m 02s
completed: 2026-04-23
---

# Phase 5 Plan 04: Auth Provider + Redirect Bridge + Sign-out Summary

**Client-only MSAL bootstrap, COOP redirect bridge, host-aware tokenProvider, chat surface Bearer header DI, sign-out flow, token_expired retry, and an E2E MSAL stub.**

## Performance

- **Duration:** ~14 min active
- **Started:** 2026-04-23T13:04:00Z
- **Completed:** 2026-04-23T13:19:00Z (approximate — spans two task blocks)
- **Tasks:** 2 (both autonomous — no checkpoints)
- **Files created:** 6 (2 auth src + 2 redirect route + 1 fixture + 1 summary)
- **Files modified:** 19 (8 chat-ui src/test + 1 providers + 10 e2e specs)

## Accomplishments

- `tokenProvider.acquireToken(account?)` host-aware: browser silent → redirect, Teams silent → popup. Scopes pulled from Plan 05-01 `DEFAULT_SCOPES`. MSAL v5 `errorCode === 'interaction_required'` guard (NOT `error.message` — v5 drift). `signOut()` → `logoutRedirect({postLogoutRedirectUri:'/'})`.

- `src/app/providers.tsx` REPLACED. Client-only `AuthProvider` inits MSAL via `useEffect` + `getMsalInstance()` (which is async because Plan 05-01's `createNestablePublicClientApplication` factory is async). Renders a fallback skeleton until ready, then `<MsalProvider instance={msal}>`. Composed with the pre-existing `Tooltip.Provider` so Phase-4 About Popover tooltips still work.

- `/auth/redirect` page + fragment-passthrough layout. The layout (`export default function AuthRedirectLayout({children}) { return <>{children}</> }`) is intentional: App Router nested layouts REPLACE the parent layout for their route segment, so the fragment fully overrides the root `Providers` wrap without emitting duplicate `<html>`/`<body>` (Pitfall 7 — avoids `interaction_in_progress` on redirect reload). Page calls `broadcastResponseToMainFrame()` from `@azure/msal-browser/redirect-bridge` with a `window.location.replace('/')` fallback.

- `ChatPage` gates on MSAL state: `inProgress !== 'none' || !isAuthenticated || !hydrated` → skeleton; `authenticated + claims.tid !== ALLOWED_TENANT` → `router.replace('/access-denied')`; `!isAuthenticated + inProgress === 'none'` useEffect fires `acquireToken(null).catch(()=>{})` to kick off host-aware sign-in.

- `useChatStream` extended with three optional DI options (`acquireToken`, `onTokenExpired`, `onAccessDenied`). Pre-stream branching on `res.status === 401` (body `token_expired` → dispatch + `onTokenExpired?.()`; else → generic unauthorized-as-internal) and `res.status === 403` (body `access_denied` → `onAccessDenied?.()` without error dispatch). Only 200 responses proceed to the SSE reader. No `token_expired` SSE frame handling — discriminant is HTTP-only per Plan 05-03 contract.

- `ChatSurface` wires `acquireToken` → `boundAcquireToken` callback into `useChatStream` options, surfaces `onAccessDenied` → `router.replace('/access-denied')`, adds a sign-out flow (confirm dialog when dirty; direct logoutRedirect when clean), and the `token_expired` retry path `await acquireToken(null)` BEFORE replaying the send so the retried request carries a freshly acquired Bearer. Top-level `import { acquireToken, signOut }` is safe here because ChatSurface lives inside MsalProvider context.

- `Header` adds an optional `onSignOut` prop; when provided, the role-pill popover renders a "Sign out" menu entry below "Change role". Back-compat preserved: Phase-3/4 tests that call Header without `onSignOut` get the old render exactly.

- `ChangeRoleDialog` parameterised with optional `title`, `description`, `confirmLabel`, `cancelLabel` props. Defaults preserve Phase-3 behaviour. ChatSurface's sign-out flow reuses the component with overridden copy ("Sign out?" / "Sign out and clear") rather than duplicating into a structurally-identical `SignOutDialog.tsx`.

- `tests-e2e/fixtures/mockMsal.ts` — `stubMsalAuthenticated(page)` seeds MSAL v5 sessionStorage with a synthetic account entity + activates a test-only `window.__E2E_MSAL_TOKEN__` bypass read by `tokenProvider.acquireToken`. Wired into all 11 existing Phase-3/4 Playwright spec beforeEach blocks. All 19/19 E2E tests green without live Entra.

## Task Commits

1. **Task 1: tokenProvider + AuthProvider + redirect bridge** — `b2f5180` (feat)
2. **Task 2: ChatPage auth gate + sign-out + token_expired retry + E2E fixture** — `d5c20e9` (feat)

**Plan metadata:** _pending_ — committed after this SUMMARY + STATE.md update.

## Files Created/Modified

### Created

- `src/auth/tokenProvider.ts` — host-aware acquireToken + signOut. Includes the `window.__E2E_MSAL_TOKEN__` test-bypass guard.
- `src/auth/__tests__/tokenProvider.test.ts` — 5 tests: silent success, silent→popup on Teams, silent→redirect on browser, no-account→loginPopup on Teams, signOut→logoutRedirect('/').
- `src/app/auth/redirect/layout.tsx` — fragment-passthrough nested layout (Pitfall 7 guard).
- `src/app/auth/redirect/page.tsx` — COOP bridge calling `broadcastResponseToMainFrame`.
- `tests-e2e/fixtures/mockMsal.ts` — `stubMsalAuthenticated(page)` Playwright helper.

### Modified

- `src/app/providers.tsx` — full replacement wrapping `MsalProvider` in client-only AuthProvider.
- `src/chat-ui/ChatPage.tsx` — adds auth gating + wrong-tenant redirect.
- `src/chat-ui/ChatSurface.tsx` — adds acquireToken DI, sign-out flow, token_expired retry, access-denied callback.
- `src/chat-ui/Header.tsx` — adds optional onSignOut prop + menu entry.
- `src/chat-ui/ChangeRoleDialog.tsx` — parameterised title/description/confirmLabel/cancelLabel.
- `src/chat-ui/useChatStream.ts` — acquireToken + onTokenExpired + onAccessDenied DI; pre-stream 401/403 branching.
- `src/chat-ui/__tests__/Header.test.tsx` — +2 tests for Sign out menu entry (onSignOut fires / hidden when prop omitted).
- `src/chat-ui/__tests__/ChatSurface.test.tsx` — module-level vi.mock() for next/navigation, @azure/msal-react, @/auth/tokenProvider; +2 tests (`token_expired onRetry calls acquireToken before replay` — exact name per plan; sign-out-with-draft confirm flow).
- `tests-e2e/*.spec.ts` (11 files) — each calls `stubMsalAuthenticated(page)` in beforeEach / per-test setup.

## Decisions Made

| # | Decision | Rationale |
|---|---|---|
| 1 | `@azure/msal-browser/redirect-bridge` subpath export IS present in v5.8.0 | Verified against `node_modules/@azure/msal-browser/package.json` `exports` field (`./redirect-bridge` entry resolves to `./dist/redirect-bridge/redirect_bridge/index.mjs`) and typed `broadcastResponseToMainFrame(navigationClient?: NavigationClient): Promise<void>`. No fallback path needed — catch-branch remains as defensive code for future minor drift only. |
| 2 | Parameterised `ChangeRoleDialog` rather than adding `SignOutDialog.tsx` | Structural 100% duplicate otherwise. Plan guidance: "pick whichever keeps the diff smallest". Parameterisation adds ~10 lines (3 optional props + defaults); a sibling component would add ~45 lines. Phase-3 default behaviour is preserved exactly — existing tests don't pass any overrides. |
| 3 | `access_denied` handled via `onAccessDenied` callback, NOT by extending `ErrorCode` union | Extending `ErrorCode` would require a 6th entry in `ErrorCard.TITLE` + potential sub-copy branch. But the UX intent is to navigate the user AWAY from the chat surface — they never see an error card. A callback that invokes `router.replace('/access-denied')` matches the intent and avoids type-surface churn. |
| 4 | `useChatStream` takes acquireToken via DI (Option A) rather than top-level import | A top-level `import { acquireToken } from '@/auth/tokenProvider'` at the hook layer would force MSAL into every existing Phase-3 unit test for `useChatStream` (none of which currently mock MSAL). Option-A DI keeps those tests passing unchanged — they simply omit the option. |
| 5 | Test-only `window.__E2E_MSAL_TOKEN__` bypass in `tokenProvider.ts` | Playwright E2E specs seeded the account entity but not idToken credential entities (format is complex: 8-tuple pipe-separated key via `generateCredentialKey`). Without idToken, `acquireTokenSilent` throws `interaction_required` → cascades to `acquireTokenRedirect` → navigates to login.microsoftonline.com → test timeout. The bypass flag is read ONLY if `window.__E2E_MSAL_TOKEN__` is truthy; production bundles never set it. Alternative (seeding full credential entities) would be brittle against MSAL minor updates. |
| 6 | Wrong-tenant gate explicitly no-ops on `'dev-only-do-not-use-in-prod'` placeholder | `NEXT_PUBLIC_ENTRA_TENANT_ID` defaults to that literal in dev/test env (Plan 05-01). Without the no-op guard, every authenticated session in dev would immediately bounce to `/access-denied` because the seeded test account uses a real-shaped GUID that doesn't match the placeholder string. |
| 7 | `ChatPage` useEffect catches `acquireToken(null).catch(()=>{})` silently | In browser path, interactive fallback is `acquireTokenRedirect` which navigates away; the promise throws 'unreachable — navigated away'. In Teams path, `acquireTokenPopup` can be user-cancelled (popup close → `user_cancelled` error). Either way, surfacing a red error card in the auth-gate effect would be noisy. MSAL's event system handles the legit failures downstream (landing on `/access-denied` or re-rendering authed). |
| 8 | Fresh `handleRetry` in ChatSurface is `async` | token_expired path must `await acquireToken(null)` BEFORE dispatching `assistant/retry` + `assistant/start` + `send()`, so the replay carries the refreshed Bearer. Other error codes retain synchronous retry behaviour (the `isTokenExpired` guard short-circuits the extra async work). MessageList's `onRetry` prop stays `(id: string) => void` via a void-returning arrow wrapper at the call site. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocker] ChatSurface.test.tsx's "Returning user" ChatPage test broke after ChatPage.tsx added useRouter + useMsal + acquireToken dependencies**

- **Found during:** intermediate verify after Task 2 sub-step 1 (ChatPage edit)
- **Issue:** `renderWithProviders(<ChatPage />)` in Phase-3 returning-user test now throws "invariant expected app router to be mounted" because `useRouter()` requires the Next.js App-Router provider, which isn't present in jsdom test env. Similarly `useIsAuthenticated()` / `useMsal()` need MSAL context.
- **Fix:** Added module-level `vi.mock()` calls at the top of `ChatSurface.test.tsx` for `next/navigation`, `@azure/msal-react`, and `@/auth/tokenProvider`. Hoisted mock state via `vi.hoisted()` so `beforeEach` can reset the default-authenticated state between tests. Existing Phase-3/4 tests continue unchanged; the new MSAL + router hooks just return a stable authenticated + spy state.
- **Files modified:** `src/chat-ui/__tests__/ChatSurface.test.tsx`
- **Verification:** 567/567 unit tests green (+5 net from Plan 05-04: 2 Header sign-out, 2 ChatSurface token_expired/signout, and 1 absorbed by hoisted mock wiring)
- **Committed in:** `d5c20e9` (Task 2 commit)

**2. [Rule 3 — Blocker] Playwright MSAL account-key format initially wrong (first pass used `-` delimiter + schema-version-less key)**

- **Found during:** first E2E run after fixture creation — all 13 non-role-select specs failed with external login.microsoftonline.com navigation timeout
- **Issue:** My initial `stubMsalAuthenticated(page)` used `${HOME}-<env>-<tenant>` dash-separated keys and `msal.account.keys` pointer without schema version prefix. MSAL v5.8.0's `BrowserCacheManager.generateAccountKey` (verified via `grep -n "generateAccountKey" dist/cache/BrowserCacheManager.mjs`) actually uses pipe separator + schema-version prefix: `msal.3|<home>|<env>|<tenant>` (lowercase), with pointer `msal.3.account.keys`.
- **Fix:** Updated fixture to match the real key format. Also added the `window.__E2E_MSAL_TOKEN__` test-only bypass in `tokenProvider.ts` because even with correct account keys, `acquireTokenSilent` would throw `interaction_required` without seeded idToken credentials and cascade into `acquireTokenRedirect` → external navigation. The bypass short-circuits the cascade in E2E only.
- **Files modified:** `tests-e2e/fixtures/mockMsal.ts`, `src/auth/tokenProvider.ts`
- **Verification:** All 19/19 Playwright E2E specs green after the two-part fix
- **Committed in:** `d5c20e9` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocker / library drift).
**Impact on plan:** Behavioural contract unchanged. Both deviations are mechanical — matching the actual MSAL v5.8.0 runtime shape. The E2E bypass is an explicit test-only affordance documented in both the fixture and the tokenProvider source.

## Issues Encountered

- **Parallel Plan 05-03 wave intermediate state.** When Task 2 intermediate verify ran, four tests in `src/app/api/__tests__/_middleware.test.ts` and `src/app/api/chat/__tests__/route.test.ts` were failing — those files are explicitly owned by Plan 05-03 (parallel Wave-2). By the time Task 2 full-suite verify ran, Plan 05-03 had committed its work (`4c1d0bb`, `677f7bf`, `f0925be`) and all tests returned to green. Confirmed by `git log --oneline -5` showing 05-03's three commits interleaved with my 05-04 commits.

- **MSAL account-key drift.** Two-round fix documented above. Lessons: MSAL v5 cache-key format is NOT documented in public API docs; had to `grep` the dist `.mjs` for `generateAccountKey` / `getAccountKeysCacheKey`. Future maintainers who upgrade `@azure/msal-browser` across a minor must re-verify the fixture against the installed version's `BrowserCacheManager::generateAccountKey` implementation.

- **Auth cascade in E2E without full credential entities.** The fixture intentionally does NOT seed idToken / accessToken entities because the format is brittle (8-tuple key: `msal.<schema>|<home>|<env>|<credentialType>|<familyId|clientId>|<realm>|<target>|<scheme>`). Instead a test-only `window.__E2E_MSAL_TOKEN__` bypass in `tokenProvider.ts` short-circuits `acquireTokenSilent → acquireTokenRedirect` cascades. Production builds never see the symbol.

## User Setup Required

None for Plan 05-04 itself. Plan 05-01's Entra App Registration still needs to be provisioned before first real sign-in (see `05-01-auth-foundation-PLAN.md` frontmatter `user_setup.entra-app-registration.dashboard_config`).

## Next Phase Readiness

**Ready for Plan 05-05** (Teams manifest + CI/CD deploy):

- `/api/health` already canary-ready (Plan 05-02).
- `.npmrc` already hoisted-linker (Plan 05-01).
- AuthProvider + redirect bridge are production-ready — the COOP redirect flow is MSAL v5's standard path and Plan 05-05's Teams manifest can reference `/auth/redirect` as the `validDomains` redirect target.
- `tests-e2e/fixtures/mockMsal.ts` is reusable by Plan 05-05's `teams-naa-smoke.spec.ts` — import the `stubMsalAuthenticated` helper directly.

**Concerns:**

- **MSAL v5.8.0 vs v5.x.y drift.** The `generateAccountKey` format is pinned-by-dist-inspection. If `@azure/msal-browser` upgrades across a minor during Phase-5 pilot, the Playwright fixture may need re-adaptation. Mitigation: the fixture file's documentation explicitly points the next maintainer at `node_modules/@azure/msal-browser/dist/cache/BrowserCacheManager.mjs::generateAccountKey`.

- **`window.__E2E_MSAL_TOKEN__` test-only bypass is inert in production.** The symbol is never written by application code. Bundle analysis (if enforced) should not flag it — it's a plain string-keyed `window` read. Production redirect flow is fully exercised by manual smoke (Plan 05-05 deploy verify).

- **E2E coverage of Teams host path.** Playwright runs in a browser, so `detectHost()` always resolves to `'browser'`. Teams-path behaviour (`loginPopup` / `acquireTokenPopup`) is covered only by unit tests (tokenProvider.test.ts). Plan 05-05's `teams-naa-smoke.spec.ts` will add a Teams-side smoke.

- **`ChangeRoleDialog` is used by TWO flows now** (role-change + sign-out). The component name is historically accurate for the first use but misleading for the second. Renaming would force Phase-3/4 E2E selectors (`getByRole('button', {name: /change role and clear/i})`) to churn. Acceptable tradeoff — both flows document which copy they pass.

---

*Phase: 05-sso-and-teams-delivery*
*Completed: 2026-04-23*
