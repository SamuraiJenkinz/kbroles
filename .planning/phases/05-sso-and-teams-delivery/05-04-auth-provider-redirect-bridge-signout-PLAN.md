---
phase: 05-sso-and-teams-delivery
plan: 04
type: execute
wave: 2
depends_on: ["05-01", "05-02"]
files_modified:
  - src/auth/tokenProvider.ts
  - src/auth/__tests__/tokenProvider.test.ts
  - src/app/providers.tsx
  - src/app/auth/redirect/layout.tsx
  - src/app/auth/redirect/page.tsx
  - src/chat-ui/ChatPage.tsx
  - src/chat-ui/Header.tsx
  - src/chat-ui/__tests__/Header.test.tsx
  - src/chat-ui/useChatStream.ts
  - src/chat-ui/ChatSurface.tsx
  - tests-e2e/fixtures/mockMsal.ts
autonomous: true

must_haves:
  truths:
    - "`AuthProvider` (a 'use client' wrapper colocated in src/app/providers.tsx) initialises MSAL via `getMsalInstance()` in useEffect, then renders `MsalProvider` around its children. Server components (app/layout.tsx) remain untouched — no `window` access at render time."
    - "`src/app/auth/redirect/page.tsx` calls `broadcastResponseToMainFrame()` from `@azure/msal-browser/redirect-bridge` on mount (RESEARCH Pattern 2; COOP redirect bridge is MANDATORY in MSAL v5). Its sibling `layout.tsx` is a fragment-passthrough layout (returns `<>{children}</>`; MUST NOT emit `<html>`/`<body>` — those belong to the single root layout only) that overrides the root Providers (MsalProvider) wrapping because Next.js App Router nested layouts replace parent layouts entirely for their route segment — without this, MsalProvider fires an `interaction_in_progress` error on redirect reload (Pitfall 7)."
    - "`ChatPage` gates render on auth state: unauthenticated → triggers `acquireTokenSilent` → `acquireTokenRedirect` (browser) or `acquireTokenPopup` (Teams — RESEARCH open-question #2 correction, NOT redirect). Authenticated but `accounts[0].idTokenClaims.tid !== NEXT_PUBLIC_ENTRA_TENANT_ID` → `router.replace('/access-denied')`. Authenticated + allowed tenant → existing `useRolePersistence` hydration flow."
    - "`tokenProvider.acquireToken()` returns a Bearer JWT for the active account, host-aware. Browser path: silent → redirect on `interaction_required`. Teams path: silent → popup on `interaction_required`. Used by `useChatStream` to attach `Authorization: Bearer <token>` to every `/api/chat` call (replacing the unauthenticated Phase-3 fetch)."
    - "`Header` adds a 'Sign out' option in the existing role-pill popover (below 'Change role'). Clicking it: if chat has a draft OR an in-flight stream, shows a reused ChangeRoleDialog-style confirm first; on confirm, clears in-memory chat state, resets `useRolePersistence` + `useDraftBuffer`, then calls `msalInstance.logoutRedirect({postLogoutRedirectUri:'/'})`."
    - "`useChatStream` accepts two new optional options — `acquireToken?: () => Promise<string | null>` (Option A dependency injection; no top-level `@/auth/tokenProvider` import, so existing Phase-3 unit tests that omit the option continue to pass without MSAL mocks) and `onTokenExpired?: () => void`. Before each `/api/chat` fetch it invokes `opts.acquireToken?.()` and attaches `Authorization: Bearer <token>` if a token is returned. BEFORE entering the SSE reader it branches on `response.status`: (a) 401 with JSON body `{error:'token_expired'}` → dispatch `assistant/error` with code `token_expired` AND call `opts.onTokenExpired?.()`; (b) 401 with `{error:'unauthorized'}` → dispatch `assistant/error` with code `unauthorized`; (c) 403 with `{error:'access_denied'}` → dispatch `assistant/error` with code `access_denied` (or navigate to `/access-denied` via a ChatSurface callback); only 200 responses proceed to the SSE reader. NO `token_expired` SSE frame is emitted or consumed — the discriminant is delivered via the pre-stream HTTP 401 + JSON body ONLY (Plan 05-03 truth #5). ChatSurface's onRetry for a `token_expired` error card invokes `tokenProvider.acquireToken()` (silent → host-aware interactive) BEFORE replaying the send, so the replay carries a freshly acquired Bearer token."
  artifacts:
    - path: "src/auth/tokenProvider.ts"
      provides: "Host-aware acquireToken with silent → redirect (browser) | popup (Teams) fallback"
      exports: ["acquireToken", "signOut"]
    - path: "src/app/providers.tsx"
      provides: "AuthProvider client wrapper: loads MSAL in useEffect, renders MsalProvider, composes with existing Tooltip.Provider"
      contains: "MsalProvider"
    - path: "src/app/auth/redirect/page.tsx"
      provides: "COOP-safe redirect bridge invoking broadcastResponseToMainFrame"
      exports: ["default"]
    - path: "src/app/auth/redirect/layout.tsx"
      provides: "Fragment-passthrough nested layout (returns <>{children}</>; no <html>/<body>) overriding root Providers/MsalProvider (Pitfall 7 guard)"
      exports: ["default"]
    - path: "src/chat-ui/Header.tsx"
      provides: "Sign-out option in the role-pill popover with draft/in-flight confirm"
      contains: "Sign out"
    - path: "tests-e2e/fixtures/mockMsal.ts"
      provides: "stubMsalAuthenticated(page) Playwright helper seeding MSAL v5 sessionStorage with a synthetic authenticated account; consumed by Phase-3/4 specs + Plan 05-05 teams-naa-smoke.spec.ts"
      exports: ["stubMsalAuthenticated"]
  key_links:
    - from: "src/app/providers.tsx"
      to: "src/auth/msalInstance.ts + @azure/msal-react"
      via: "useEffect → getMsalInstance() → setState → MsalProvider"
      pattern: "getMsalInstance|MsalProvider"
    - from: "src/app/auth/redirect/page.tsx"
      to: "@azure/msal-browser/redirect-bridge"
      via: "broadcastResponseToMainFrame"
      pattern: "broadcastResponseToMainFrame"
    - from: "src/chat-ui/ChatSurface.tsx"
      to: "src/auth/tokenProvider.ts"
      via: "import { acquireToken } + pass bound callback to useChatStream options (Option A DI — useChatStream itself does NOT import tokenProvider, preserving Phase-3 unit test isolation)"
      pattern: "acquireToken"
    - from: "src/chat-ui/ChatSurface.tsx"
      to: "ErrorCard token_expired onRetry"
      via: "tokenProvider.acquireToken() before replay"
      pattern: "token_expired|acquireToken"
---

<objective>
Wire the browser + Teams auth surfaces into the app: AuthProvider in providers.tsx (loads MSAL client-side only), the COOP redirect bridge page (MSAL v5 REQUIRED), `tokenProvider.acquireToken()` used by `useChatStream`, and the Header sign-out affordance. This is the last piece before the Teams manifest + deploy workflow (Plan 05).

Purpose: Without this plan, the Plan-03 middleware rejects every real request because no Authorization header is ever attached. This plan attaches the header and handles the full auth lifecycle (initial redirect, silent refresh, token_expired recovery, sign-out).

CRITICAL anti-patterns to avoid (RESEARCH §Anti-Patterns):
- Calling `getMsalInstance()` in `src/app/layout.tsx` (server component).
- Skipping the `/auth/redirect` bridge page (MSAL v5 COOP requirement).
- Using `microsoftTeams.getAuthToken()` for NAA (legacy OBO path; NAA uses MSAL directly).
- Using `acquireTokenRedirect` in a Teams tab (iframe navigation problem — use popup).

Output:
- `src/auth/tokenProvider.ts` — host-aware `acquireToken()` + `signOut()`.
- `src/app/providers.tsx` extended: wraps existing Tooltip.Provider with a new AuthProvider that renders MsalProvider once MSAL is ready.
- `src/app/auth/redirect/page.tsx` + `layout.tsx` — COOP bridge (RESEARCH Pattern 2).
- `src/chat-ui/ChatPage.tsx` — auth gating (unauth → redirect/popup; wrong-tenant → /access-denied; ok → existing role flow).
- `src/chat-ui/Header.tsx` + tests — sign-out option with draft/in-flight confirm.
- `src/chat-ui/useChatStream.ts` — attaches Bearer header, surfaces `token_expired` callback.
- `src/chat-ui/ChatSurface.tsx` — onRetry for `token_expired` errors runs silent-refresh before replay.
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
@src/auth/msalInstance.ts
@src/auth/msalConfig.ts
@src/auth/detectHost.ts
@src/app/providers.tsx
@src/app/layout.tsx
@src/chat-ui/ChatPage.tsx
@src/chat-ui/ChatSurface.tsx
@src/chat-ui/Header.tsx
@src/chat-ui/ChangeRoleDialog.tsx
@src/chat-ui/useChatStream.ts
@src/chat-ui/useRolePersistence.ts
@src/chat-ui/useDraftBuffer.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: tokenProvider + AuthProvider wrapper + redirect bridge page</name>
  <files>
    src/auth/tokenProvider.ts,
    src/auth/__tests__/tokenProvider.test.ts,
    src/app/providers.tsx,
    src/app/auth/redirect/layout.tsx,
    src/app/auth/redirect/page.tsx
  </files>
  <action>
Four files that together form the auth runtime.

**1. `src/auth/tokenProvider.ts`** — host-aware token acquisition. Teams uses popup (NOT redirect — iframe problem), browser uses redirect.

```typescript
/**
 * Host-aware token provider. Browser path: silent → redirect on interaction_required.
 * Teams path: silent → popup on interaction_required (RESEARCH open-question #2
 * correction — CONTEXT said redirect but Teams tabs are iframes and redirect
 * navigates the parent Teams window, not the tab).
 *
 * DEFAULT_SCOPES come from msalConfig so token TTL stays consistent. Caller
 * (useChatStream) attaches the returned Bearer to /api/chat requests.
 *
 * Phase 5 — Plan 05-04 Task 1.
 */
import type { AccountInfo, AuthenticationResult, IPublicClientApplication } from '@azure/msal-browser'
import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { getMsalInstance } from './msalInstance'
import { DEFAULT_SCOPES } from './msalConfig'
import { detectHost } from './detectHost'

export async function acquireToken(account?: AccountInfo | null): Promise<string> {
  const msal: IPublicClientApplication = await getMsalInstance()
  const activeAccount = account ?? msal.getActiveAccount() ?? msal.getAllAccounts()[0]
  if (!activeAccount) {
    // No account — force a sign-in via the host-appropriate interactive path.
    const host = await detectHost()
    const result: AuthenticationResult =
      host === 'teams'
        ? await msal.acquireTokenPopup({ scopes: [...DEFAULT_SCOPES] })
        : await (async () => {
            // loginRedirect never resolves in-page (it navigates away); the
            // returned promise is for pre-redirect error handling only. Use
            // loginPopup on Teams; on browser loginRedirect is fine.
            await msal.loginRedirect({ scopes: [...DEFAULT_SCOPES] })
            throw new Error('unreachable — loginRedirect navigated away')
          })()
    return result.accessToken || result.idToken
  }

  try {
    const result = await msal.acquireTokenSilent({
      account: activeAccount,
      scopes: [...DEFAULT_SCOPES],
    })
    return result.accessToken || result.idToken
  } catch (err) {
    // MSAL v5: check error.errorCode, NOT error.message (message is now a URL hash).
    if (err instanceof InteractionRequiredAuthError || (err as { errorCode?: string }).errorCode === 'interaction_required') {
      const host = await detectHost()
      if (host === 'teams') {
        const result = await msal.acquireTokenPopup({
          account: activeAccount,
          scopes: [...DEFAULT_SCOPES],
        })
        return result.accessToken || result.idToken
      }
      await msal.acquireTokenRedirect({ account: activeAccount, scopes: [...DEFAULT_SCOPES] })
      throw new Error('unreachable — acquireTokenRedirect navigated away')
    }
    throw err
  }
}

export async function signOut(): Promise<void> {
  const msal = await getMsalInstance()
  await msal.logoutRedirect({ postLogoutRedirectUri: '/' })
}
```

**2. `src/auth/__tests__/tokenProvider.test.ts`** — mock `getMsalInstance` + `detectHost`; cover:
- Active account + silent succeeds → returns accessToken.
- Active account + silent throws `InteractionRequiredAuthError` + host='teams' → calls `acquireTokenPopup` (not redirect).
- Active account + silent throws `InteractionRequiredAuthError` + host='browser' → calls `acquireTokenRedirect`.
- No account + host='teams' → calls `acquireTokenPopup` directly.
- `signOut()` calls `logoutRedirect({postLogoutRedirectUri:'/'})`.

**3. `src/app/providers.tsx`** — REPLACE the current content:

```tsx
'use client'
import * as Tooltip from '@radix-ui/react-tooltip'
import { MsalProvider } from '@azure/msal-react'
import type { IPublicClientApplication } from '@azure/msal-browser'
import { useEffect, useState, type ReactNode } from 'react'
import { getMsalInstance } from '@/auth/msalInstance'

/**
 * Client-only MSAL bootstrap. getMsalInstance() touches window/sessionStorage
 * so it can't run in the server render. We initialise in useEffect and render
 * a fallback skeleton until MSAL is ready.
 *
 * Composed with the existing Tooltip.Provider so Phase-4 About Popover tooltips
 * continue to work.
 *
 * Phase 5 — Plan 05-04 Task 1.
 */
function AuthProvider({ children }: { children: ReactNode }) {
  const [msal, setMsal] = useState<IPublicClientApplication | null>(null)

  useEffect(() => {
    let cancelled = false
    getMsalInstance().then((instance) => {
      if (!cancelled) setMsal(instance)
    })
    return () => { cancelled = true }
  }, [])

  if (!msal) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
        <div className="h-24 w-full max-w-md animate-pulse rounded-xl bg-neutral-card shadow-sm" />
      </main>
    )
  }

  return <MsalProvider instance={msal}>{children}</MsalProvider>
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Tooltip.Provider delayDuration={300} skipDelayDuration={100}>
        {children}
      </Tooltip.Provider>
    </AuthProvider>
  )
}
```

**4. `src/app/auth/redirect/layout.tsx`** — MINIMAL fragment-passthrough layout that overrides the root layout's Providers wrapping. In Next.js App Router, nested layouts REPLACE the parent layout entirely for their route segment — they do NOT wrap the parent — so a fragment-returning nested layout fully overrides the root Providers wrap without emitting duplicate `<html>`/`<body>` tags (which would cause hydration warnings + invalid HTML). Without this nested layout, the redirect page would inherit the root Providers wrap and MsalProvider would fire `interaction_in_progress` errors on reload (Pitfall 7).

```tsx
import type { ReactNode } from 'react'

/**
 * Fragment-passthrough nested layout — deliberately does NOT include Providers.
 * Next.js App Router nested layouts REPLACE the parent layout for their route
 * segment (they do NOT wrap it), so returning a plain fragment here fully
 * overrides the root layout's <Providers> wrap while correctly delegating
 * <html>/<body> emission to the single root layout (nested layouts must NOT
 * emit <html>/<body> — that causes hydration warnings and invalid HTML).
 *
 * The /auth/redirect page calls broadcastResponseToMainFrame() and immediately
 * closes the popup / redirects back — it must NOT be wrapped in MsalProvider
 * because MSAL detects an `interaction_in_progress` state that would
 * block the response.
 *
 * Pitfall 7 guard. Phase 5 — Plan 05-04 Task 1.
 */
export default function AuthRedirectLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

**5. `src/app/auth/redirect/page.tsx`** — COOP bridge. Calls `broadcastResponseToMainFrame()` on mount per RESEARCH Pattern 2.

```tsx
'use client'
import { useEffect } from 'react'

/**
 * MSAL v5 COOP redirect bridge. When Entra redirects back here after sign-in,
 * this page forwards the auth response to the main frame via the message
 * channel MSAL sets up. Without this, Entra's Cross-Origin-Opener-Policy
 * headers break the redirect flow.
 *
 * RESEARCH Pattern 2 + Pitfall 1. Phase 5 — Plan 05-04 Task 1.
 */
export default function AuthRedirectPage() {
  useEffect(() => {
    (async () => {
      try {
        const mod = await import('@azure/msal-browser/redirect-bridge')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(mod as any).broadcastResponseToMainFrame?.()
      } catch {
        // If the bridge import path moves in a future MSAL minor, fall back to
        // a hard redirect to '/' so the main app picks up the hash/state.
        if (typeof window !== 'undefined') window.location.replace('/')
      }
    })()
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-sm text-neutral-500">
      Signing in…
    </main>
  )
}
```

If `@azure/msal-browser/redirect-bridge` subpath export does not exist in the installed version, fall back to calling `msal.handleRedirectPromise()` directly and redirecting to `/`. Verify with `pnpm list @azure/msal-browser` and `ls node_modules/@azure/msal-browser/dist/redirect-bridge*`. Record the resolution in SUMMARY.
  </action>
  <verify>
`pnpm typecheck` clean. `pnpm test src/auth/__tests__/tokenProvider.test.ts` green. Files exist at documented paths. Grep `getMsalInstance` across src/app/layout.tsx returns NO matches (confirms server-component invariant). Grep `loadingMsal` in the redirect layout.tsx returns NO matches (confirms empty nested layout).
  </verify>
  <done>
tokenProvider exposes host-aware acquireToken + signOut. Providers.tsx renders MsalProvider client-side only. Redirect bridge page + empty nested layout exist and match RESEARCH Pattern 2.
  </done>
</task>

<task type="auto">
  <name>Task 2: ChatPage auth gating + Header sign-out + useChatStream bearer wiring + token_expired retry</name>
  <files>
    src/chat-ui/ChatPage.tsx,
    src/chat-ui/Header.tsx,
    src/chat-ui/__tests__/Header.test.tsx,
    src/chat-ui/useChatStream.ts,
    src/chat-ui/ChatSurface.tsx
  </files>
  <action>
Wire auth into the chat surface end-to-end. Five interconnected edits — minimal surface area per file, all in one task because they form a single logical unit.

**1. `src/chat-ui/ChatPage.tsx`** — gate render on MSAL account state + tenant allowlist.

```tsx
'use client'
import { useIsAuthenticated, useMsal, useAccount } from '@azure/msal-react'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRolePersistence } from './useRolePersistence'
import { RoleSelect } from './RoleSelect'
import { ChatSurface } from './ChatSurface'
import { acquireToken } from '@/auth/tokenProvider'

const ALLOWED_TENANT = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID

export function ChatPage() {
  const isAuthenticated = useIsAuthenticated()
  const { accounts, inProgress } = useMsal()
  const account = useAccount(accounts[0] ?? undefined)
  const router = useRouter()
  const { role, setRole, hydrated } = useRolePersistence()

  // Wrong-tenant gate: authenticated but claims.tid not on allowlist.
  useEffect(() => {
    if (isAuthenticated && account?.idTokenClaims?.tid && ALLOWED_TENANT && account.idTokenClaims.tid !== ALLOWED_TENANT) {
      router.replace('/access-denied')
    }
  }, [isAuthenticated, account, router])

  // Unauth + MSAL idle: kick off sign-in. acquireToken handles host-aware interactive fallback.
  useEffect(() => {
    if (!isAuthenticated && inProgress === 'none') {
      acquireToken(null).catch(() => {
        // Silent-to-interactive threw; the user either saw a popup/redirect
        // or something went wrong. Surfacing an error here is noisy — MSAL's
        // events will land the user on /access-denied or re-render authed.
      })
    }
  }, [isAuthenticated, inProgress])

  if (inProgress !== 'none' || !isAuthenticated || !hydrated) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
        <div className="h-24 w-full max-w-md animate-pulse rounded-xl bg-neutral-card shadow-sm" />
      </main>
    )
  }

  if (role == null) return <RoleSelect onPick={setRole} />
  return <ChatSurface role={role} onChangeRole={() => setRole(null)} />
}
```

**2. `src/chat-ui/Header.tsx`** — add "Sign out" in the role-pill popover, below "Change role". Show reused confirm dialog when draft/in-flight exists.

Add a new prop `onSignOut: () => void` (ChatSurface supplies it — wires into `tokenProvider.signOut()` + state-clear). Add a menu entry:

```tsx
<Popover.Content ...>
  <button onClick={onChangeRole} className="...">Change role</button>
  <button onClick={onSignOut} className="...">Sign out</button>
</Popover.Content>
```

DO NOT add a new dialog component — ChatSurface reuses the existing `ChangeRoleDialog` confirm pattern (title can be overridden via a new optional `title`/`description` prop on ChangeRoleDialog, OR a small sibling `SignOutDialog` can be added that's structurally identical; pick whichever keeps the diff smallest — likely ChangeRoleDialog with optional text props so one dialog serves both flows).

If parameterising ChangeRoleDialog: add optional `title?: string` / `description?: string` / `confirmLabel?: string` props with the existing defaults, and pass overridden strings from ChatSurface for the sign-out case. Update `src/chat-ui/__tests__/ChangeRoleDialog.test.tsx` to cover the custom-text branch if it exists, else just the default.

**3. `src/chat-ui/__tests__/Header.test.tsx`** — add a test that renders Header with an `onSignOut` spy, opens the popover, clicks "Sign out", and asserts the spy was called.

**4. `src/chat-ui/useChatStream.ts`** — two edits:

**Edit A: attach Bearer token via optional hook option (Option A — dependency-injected).**

CRITICAL: `useChatStream` MUST NOT top-level-import `@/auth/tokenProvider`. A static import would force MSAL to load into existing Phase-3 `useChatStream` unit tests (which run without MSAL mocked) and break them. Instead, extend the hook's options with an optional `acquireToken?: () => Promise<string | null>` callback and invoke it before each `/api/chat` fetch:

```typescript
type UseChatStreamOptions = {
  // ...existing options...
  acquireToken?: () => Promise<string | null>
  onTokenExpired?: () => void  // Edit B — see below
}

// Inside the send closure, BEFORE fetch('/api/chat', ...):
let authHeader: Record<string, string> = {}
if (opts.acquireToken) {
  try {
    const token = await opts.acquireToken()
    if (token) authHeader = { Authorization: `Bearer ${token}` }
  } catch {
    // acquireToken threw (silent + interactive both failed). Surface via the
    // existing error path with code:'unauthorized' so ErrorCard renders and
    // the user can retry → which re-invokes acquireToken → interactive path.
    dispatch({ type: 'assistant/error', code: 'unauthorized' })
    return
  }
}
const resp = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...authHeader },
  body: JSON.stringify(payload),
  signal,
})
```

`ChatSurface` (which sits inside the MSAL React context via `useMsal()`) is the caller that supplies `acquireToken` — it passes a stable callback bound to `tokenProvider.acquireToken`. The existing Phase-3 `useChatStream` unit tests continue to pass unchanged because they simply omit the `acquireToken` option (missing Authorization is still accepted by the dev-permissive path in Plan 03's middleware in non-production). No MSAL mocks are needed in those tests.

**Edit B: pre-stream 401 handling + token_expired callback.**

CRITICAL: Auth failures are delivered as pre-stream HTTP status codes + JSON response bodies (Content-Type: application/json), NOT as SSE frames. Plan 05-03 pre-stream-401s on `token_expired`/`unauthorized` and pre-stream-403s on `access_denied` — the SSE stream is never started for auth failures. So BEFORE entering the SSE reader, `useChatStream` must branch on `response.status`:

```typescript
// BEFORE entering the SSE reader:
if (response.status === 401) {
  const body = await response.json().catch(() => ({}))
  if (body.error === 'token_expired') {
    dispatch({ type: 'assistant/error', code: 'token_expired' })
    opts.onTokenExpired?.()
    return
  }
  // body.error === 'unauthorized' (or anything else 401): generic "sign back in" error path.
  dispatch({ type: 'assistant/error', code: 'unauthorized' })
  return
}
if (response.status === 403) {
  const body = await response.json().catch(() => ({}))
  if (body.error === 'access_denied') {
    // Caller (ChatSurface/ChatPage) owns the redirect to /access-denied; surface via a callback
    // or simply navigate here via `router.replace('/access-denied')` if the hook has router access.
    // Pattern: dispatch an 'access_denied' error and let ChatSurface effect a router.replace.
    dispatch({ type: 'assistant/error', code: 'access_denied' })
    return
  }
}
// Only proceed to the SSE reader on 200.
if (!response.ok) {
  dispatch({ type: 'assistant/error', code: 'http_error' })
  return
}
// ...existing SSE reader loop follows...
```

Extend the hook's options to include `onTokenExpired?: () => void`. The `token_expired` path above calls `opts.onTokenExpired?.()` AFTER dispatching the error action, so the caller (ChatSurface) is notified and can proactively kick off silent-refresh if desired. DO NOT emit or listen for a `token_expired` SSE event — there is none; the discriminant travels on the 401 response body only.

NOTE: If the existing `chatReducer` doesn't yet know about an `access_denied` error code, add it to the ErrorCode union in Plan 02 scope OR handle access_denied by a direct `router.replace('/access-denied')` in ChatSurface via a callback prop on `useChatStream`. Pick whichever minimises diff — the existing `token_expired` addition in Plan 02 is the precedent to follow.

**5. `src/chat-ui/ChatSurface.tsx`** — four edits:

**Edit A: sign-out flow.** Add a `handleSignOut` callback: if there's a draft in useDraftBuffer OR an in-flight stream, open the reused confirm dialog. On confirm: clear in-memory chat state (dispatch `conversation/clear`), clear draft buffer, clear role persistence, then call `tokenProvider.signOut()`.

**Edit B: pass onSignOut to Header.**

**Edit C: wire `acquireToken` into useChatStream (Option A).** Import `acquireToken` from `@/auth/tokenProvider` at the top of ChatSurface (this file DOES sit inside the MSAL React context — `useMsal()` is available here — so a top-level import is safe). Pass a stable bound callback into the `useChatStream({...})` options:

```tsx
import { acquireToken } from '@/auth/tokenProvider'
// ...
const boundAcquireToken = useCallback(() => acquireToken(null), [])
const { state, send, retry } = useChatStream({
  role,
  acquireToken: boundAcquireToken,   // Edit C — DI for Bearer header
  onTokenExpired: () => { /* observe only; retry remains user-initiated */ },
  // ...existing options...
})
```

**Edit D: token_expired retry.** Change the ErrorCard `onRetry` handler so that when `errorCode === 'token_expired'`, it first `await acquireToken(null)` (silent → host-aware interactive), and only on success re-invokes the hook's `retry()` (or re-sends the last user message). For any other errorCode, the existing onRetry behaviour is preserved unchanged. The sequence MUST be: acquireToken → THEN fetch replay → so the retry request carries the freshly acquired Bearer token.

Test-delta for ChatSurface: add the token_expired retry test specified in `<done>` below (exact test name locked for cross-plan verifiability).

**6. `tests-e2e/fixtures/mockMsal.ts`** — Playwright fixture that stubs MSAL as authenticated for existing Phase-3/4 specs and the Plan-05 `teams-naa-smoke.spec.ts` (Plan 05-05 Task 2 imports this helper).

Shape:

```typescript
import type { Page } from '@playwright/test'

/**
 * Populates MSAL v5 sessionStorage cache with a synthetic authenticated account
 * BEFORE the app bootstraps, so `useIsAuthenticated()` returns true without
 * driving a real Entra redirect. Used by Phase-3 + Phase-4 Playwright specs
 * that previously ran unauthenticated, and by the Plan 05-05 teams-naa-smoke
 * spec.
 *
 * The MSAL cache layout may need minor adaptation at execution time — MSAL v5
 * cache keys are documented but occasionally shift across minors. Mark any
 * adaptation in the plan SUMMARY. If layout drifts, consult:
 *   node_modules/@azure/msal-browser/dist/cache/BrowserCacheManager.js
 *
 * Placeholder TENANT/CLIENT/HOME GUIDs are test-only; the tenant GUID MUST
 * match NEXT_PUBLIC_ENTRA_TENANT_ID from the test env (use '11111111-1111-
 * 1111-1111-111111111111' unless Plan 05-01 has already locked a test tenant).
 */
export async function stubMsalAuthenticated(page: Page): Promise<void> {
  const TEST_TENANT = '11111111-1111-1111-1111-111111111111'
  const TEST_CLIENT = '22222222-2222-2222-2222-222222222222'
  const LOCAL_ACCOUNT = '33333333-3333-3333-3333-333333333333'
  const HOME_ACCOUNT = `${LOCAL_ACCOUNT}.${TEST_TENANT}`

  await page.addInitScript(
    ({ TEST_TENANT, TEST_CLIENT, LOCAL_ACCOUNT, HOME_ACCOUNT }) => {
      const accountKey = `${HOME_ACCOUNT}-login.windows.net-${TEST_TENANT}`
      const accountEntity = {
        homeAccountId: HOME_ACCOUNT,
        environment: 'login.windows.net',
        tenantId: TEST_TENANT,
        username: 'test-user@mmc.com',
        localAccountId: LOCAL_ACCOUNT,
        authorityType: 'MSSTS',
        idTokenClaims: {
          tid: TEST_TENANT,
          oid: LOCAL_ACCOUNT,
          preferred_username: 'test-user@mmc.com',
        },
      }
      sessionStorage.setItem(accountKey, JSON.stringify(accountEntity))
      sessionStorage.setItem('msal.account.keys', JSON.stringify([accountKey]))
      // msal.token.keys.<client-id> tracks idToken/accessToken/refreshToken keys;
      // an empty array is acceptable because useIsAuthenticated only checks
      // account presence. If acquireTokenSilent is exercised in a spec, extend
      // this fixture to seed a non-expired idToken entity too.
      sessionStorage.setItem(`msal.token.keys.${TEST_CLIENT}`, JSON.stringify([]))
    },
    { TEST_TENANT, TEST_CLIENT, LOCAL_ACCOUNT, HOME_ACCOUNT },
  )
}
```

CLAUDE'S DISCRETION: If the `msal.account.keys` / account-entity-key shape has shifted in the installed MSAL v5 minor, adapt the key pattern + entity fields at execution time and record the adaptation in SUMMARY. Do NOT switch to a non-storage stub (e.g. mocking `useMsal()` at the React layer) because multiple specs need the same fixture and storage-level stubbing is the lowest-layer approach.

Wire this helper into the existing `beforeEach` of any Playwright spec that previously hit the chat page unauthenticated.
  </action>
  <intermediate_verify>
After completing sub-steps 1 (ChatPage), 2+3 (Header + Header test) but BEFORE starting sub-steps 4 (useChatStream) + 5 (ChatSurface): run `pnpm test src/chat-ui` to confirm the ChatPage/Header-level changes haven't broken existing Phase-3/4 unit tests. Any regression here is faster to fix in isolation than after the useChatStream/ChatSurface edits stack on top. (Minor 10 — split verify between the two logical sub-groups.)
  </intermediate_verify>
  <verify>
`pnpm typecheck` clean. `pnpm test src/chat-ui` all green. Grep `acquireToken` in src/chat-ui returns matches in useChatStream.ts + ChatSurface.tsx (at minimum). Grep `Sign out` in Header.tsx returns one match. `tests-e2e/fixtures/mockMsal.ts` exists and exports `stubMsalAuthenticated`.
  </verify>
  <done>
- ChatPage gates on auth + tenant.
- Header has sign-out.
- useChatStream accepts `acquireToken?: () => Promise<string | null>` + `onTokenExpired?: () => void` options; branches on pre-stream response.status (401 token_expired → dispatch error + fire onTokenExpired; 401 unauthorized → dispatch error; 403 access_denied → dispatch error / redirect; only 200 enters the SSE reader). No `token_expired` SSE event handling — the discriminant is pre-stream-HTTP-only.
- ChatSurface wires `acquireToken` + re-invokes it in the ErrorCard onRetry path for `token_expired` errors before replaying the send.
- `tests-e2e/fixtures/mockMsal.ts` exists with `stubMsalAuthenticated(page)` exported (shape per sub-step 6 above).
- **`src/chat-ui/__tests__/ChatSurface.test.tsx` contains a test case named (exactly) `token_expired onRetry calls acquireToken before replay`** that asserts:
  (a) ChatSurface receives a synthetic token_expired error (either by dispatching `assistant/error` with `code: 'token_expired'` directly, or by mocking `useChatStream` to return a state with that error),
  (b) when the user clicks the Retry affordance on the resulting ErrorCard, `acquireToken` (mocked) is invoked BEFORE the message is re-sent,
  (c) the retry `fetch` (or the hook's `send`/`retry` call) carries an `Authorization` header reflecting the freshly acquired token (assert the mocked `acquireToken` resolves to `'fresh-token-xyz'`, then assert the replay request's Authorization header === `'Bearer fresh-token-xyz'`).
- All Phase 3/4 tests preserved; new unit tests green.
  </done>
</task>

</tasks>

<verification>
- `pnpm typecheck` clean.
- `pnpm test` green (all existing + new tests).
- Grep `getMsalInstance` in `src/app/layout.tsx`: NO matches (server-component invariant).
- Grep `microsoftTeams.getAuthToken` across repo: NO matches (NAA uses MSAL directly — Anti-pattern).
- Grep `supportsNestedAppAuth` across repo: NO matches (Anti-pattern).
- Grep `acquireTokenPopup` in src/auth: present in tokenProvider.ts (confirms open-question #2 correction).
- `src/app/auth/redirect/layout.tsx` exists and does NOT import Providers (Pitfall 7 guard).
- Running `pnpm dev` locally + visiting http://localhost:3000 in NODE_ENV=development should still render the app without requiring an Entra account (the dev-permissive middleware stub in Plan 03 + the authentication-not-required dev path — verify by ensuring `ChatPage` still renders under test environment with MSAL mocked as authenticated).
- Existing Playwright specs (14 Phase-3 + 5 Phase-4) must continue to pass. They interact with a mocked `/api/chat` that does not require auth; MSAL state needs to be pre-stubbed via `page.addInitScript` to fake an authenticated user. The Playwright helper `tests-e2e/fixtures/mockMsal.ts` (exported `stubMsalAuthenticated(page)`) is CREATED in Task 2 sub-step 6 above — shape, sessionStorage keys, and CLAUDE'S DISCRETION guidance are specified there. Wire this helper into the existing `beforeEach` of any spec that previously hit the chat page unauthenticated.
</verification>

<success_criteria>
- SC#1 (standalone sign-in): visiting `/` unauthenticated redirects to Entra; signed-in MMC user lands on role-select. Implemented by `ChatPage` useEffect + `tokenProvider.acquireToken(null)`.
- SC#3 (host detection): ChatPage does not call Teams-specific paths on browser; tokenProvider routes silent → redirect OR popup based on `detectHost()`.
- `token_expired` UX flow end-to-end: /api/chat 401 → ErrorCard shows "Your session expired." + "Sign back in" → click triggers silent refresh → replay succeeds.
- Sign-out flow end-to-end: confirm dialog when state dirty → clear chat/role/draft → `logoutRedirect`.
- Phase 2/3/4 tests all green (MSAL mocked where necessary; Playwright helper added).
</success_criteria>

<output>
After completion, create `.planning/phases/05-sso-and-teams-delivery/05-04-SUMMARY.md` noting:
- Whether `@azure/msal-browser/redirect-bridge` subpath export exists in the installed version + which fallback path was used if not.
- Whether ChangeRoleDialog was parameterised OR a sibling SignOutDialog was added + rationale.
- Playwright `mockMsal.ts` fixture shape + how it integrates with existing spec `beforeEach`.
- Test-delta count; total test count.
</output>
