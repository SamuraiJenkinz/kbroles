---
phase: 05-sso-and-teams-delivery
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - pnpm-lock.yaml
  - .npmrc
  - src/config/env.ts
  - src/config/__tests__/env.test.ts
  - .env.example
  - src/auth/detectHost.ts
  - src/auth/__tests__/detectHost.test.ts
  - src/auth/msalConfig.ts
  - src/auth/msalInstance.ts
  - src/auth/__tests__/msalConfig.test.ts
autonomous: true

user_setup:
  - service: entra-app-registration
    why: "MMC IT registers the SPA App Registration. Required for NAA + admin consent. Values populate env secrets downstream (Plan 03 middleware + Plan 04 AuthProvider)."
    env_vars:
      - name: NEXT_PUBLIC_ENTRA_CLIENT_ID
        source: "Entra admin → App registrations → Overview → Application (client) ID"
      - name: NEXT_PUBLIC_ENTRA_TENANT_ID
        source: "Entra admin → App registrations → Overview → Directory (tenant) ID"
      - name: ENTRA_CLIENT_ID
        source: "Same value as NEXT_PUBLIC_ENTRA_CLIENT_ID (server-side duplicate for JWT audience check)"
      - name: ENTRA_TENANT_ID
        source: "Same value as NEXT_PUBLIC_ENTRA_TENANT_ID (server-side duplicate for tenant allowlist)"
    dashboard_config:
      - task: "Register SPA with redirect URIs https://<app-service>/auth/redirect AND brk-multihub://<app-service-hostname>"
        location: "Entra admin → App registrations → New registration → Single-page application (SPA)"
      - task: "Grant admin consent for openid, profile, email, User.Read"
        location: "Entra admin → App registrations → API permissions → Grant admin consent"
      - task: "Enterprise Application → Assignment required = Yes; assign pilot cohort group"
        location: "Entra admin → Enterprise applications → Properties + Users and groups"

must_haves:
  truths:
    - "`pnpm install` succeeds with @azure/msal-browser@^5.6.3, @azure/msal-react@^5.3.1, @microsoft/teams-js@^2.52.0, jose@^6.2.2, mock-jwks (dev); pnpm-lock.yaml updated."
    - "`.npmrc` contains `node-linker=hoisted` (Pitfall 10 — required for pnpm + Next.js standalone compatibility during Plan 05 deploy)."
    - "`EnvSchema` accepts server-side `ENTRA_CLIENT_ID` and `ENTRA_TENANT_ID` as required non-empty strings in production; optional with sensible defaults in non-production so existing Phase 2/3/4 tests continue to pass without stubbing them."
    - "`detectHost()` returns `'teams'` when `microsoftTeams.app.initialize()` resolves within 150ms and `'browser'` when the promise never resolves; result is memoised module-level so repeat calls don't re-race."
    - "`getMsalInstance()` returns a singleton created via `createNestablePublicClientApplication` (MSAL v5 NAA entry point — NOT `supportsNestedAppAuth: true` which is removed); authority is `https://login.microsoftonline.com/${NEXT_PUBLIC_ENTRA_TENANT_ID}`."
    - "`getMsalInstance()` throws a clear error when called outside a browser context (no `window`) so accidental server-component use fails loud at build/test time."
  artifacts:
    - path: ".npmrc"
      provides: "pnpm linker config for Next.js standalone output"
      contains: "node-linker=hoisted"
    - path: "src/config/env.ts"
      provides: "EnvSchema extended with ENTRA_CLIENT_ID + ENTRA_TENANT_ID"
      contains: "ENTRA_CLIENT_ID"
    - path: "src/auth/detectHost.ts"
      provides: "Runtime host detection via microsoftTeams.app.initialize() + 150ms Promise.race timeout"
      exports: ["detectHost", "Host"]
    - path: "src/auth/msalConfig.ts"
      provides: "PublicClientApplication configuration object (authority, clientId, cacheLocation)"
      exports: ["msalConfig"]
    - path: "src/auth/msalInstance.ts"
      provides: "Singleton nestable PublicClientApplication (NAA-ready, falls back to standard in browser)"
      exports: ["getMsalInstance"]
  key_links:
    - from: "src/auth/msalInstance.ts"
      to: "src/auth/msalConfig.ts + @azure/msal-browser"
      via: "createNestablePublicClientApplication(msalConfig)"
      pattern: "createNestablePublicClientApplication"
    - from: "src/auth/detectHost.ts"
      to: "@microsoft/teams-js"
      via: "microsoftTeams.app.initialize() + Promise.race with 150ms timeout"
      pattern: "app\\.initialize|Promise\\.race"
---

<objective>
Lock the Phase-5 foundation: dependencies installed, `.npmrc` configured for standalone-build compatibility, env schema extended with the four Entra env vars, host detection primitive, and a singleton MSAL instance. These artifacts are prerequisites for every other Phase-5 plan (middleware in 03, AuthProvider + redirect bridge in 04, deploy in 05).

Purpose: Plans 02-05 assume `getMsalInstance()`, `detectHost()`, and `env().ENTRA_*` all exist. Splitting them into a dedicated Wave-1 plan keeps the dependency graph clean and lets Plan 02 (`/api/health` + `/access-denied` + `token_expired`) run in parallel.

Output:
- `.npmrc` with `node-linker=hoisted` (Pitfall 10 — RESEARCH anti-pattern list).
- `package.json` with 4 new prod deps (`@azure/msal-browser`, `@azure/msal-react`, `@microsoft/teams-js`, `jose`) + 1 new dev dep (`mock-jwks`).
- `src/config/env.ts` extended with `NEXT_PUBLIC_*` split documented in comments; server-side `ENTRA_CLIENT_ID` + `ENTRA_TENANT_ID` added to EnvSchema. `.env.example` updated.
- `src/auth/detectHost.ts` — host detection via `microsoftTeams.app.initialize()` + 150ms `Promise.race` timeout (RESEARCH Pattern 3 / Pitfall 2).
- `src/auth/msalConfig.ts` — config object (authority URL, clientId, `cacheLocation: 'sessionStorage'`).
- `src/auth/msalInstance.ts` — singleton `createNestablePublicClientApplication(msalConfig)` (RESEARCH Pattern 1).
- Vitest coverage for `detectHost` (both paths via mocked `@microsoft/teams-js`) + `msalConfig` (authority URL shape, algorithms) + env test for the new schema keys.
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

# Integration points
@src/config/env.ts
@src/config/__tests__/env.test.ts
@.env.example
@package.json
@next.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install deps, set .npmrc, extend EnvSchema with Entra vars</name>
  <files>
    package.json,
    pnpm-lock.yaml,
    .npmrc,
    src/config/env.ts,
    src/config/__tests__/env.test.ts,
    .env.example
  </files>
  <action>
Three linked prerequisite changes — dependency install, pnpm linker config (Pitfall 10 hard-block on Plan 05 standalone deploy), and env schema extension.

**1. Install dependencies.** Run exactly:

```bash
pnpm add @azure/msal-browser@^5.6.3 @azure/msal-react@^5.3.1 @microsoft/teams-js@^2.52.0 jose@^6.2.2
pnpm add -D mock-jwks
```

Versions are LOCKED by RESEARCH §Stack table (2026-04-23 verified). If pnpm resolves a minor newer, accept it; if a major newer, STOP and flag before proceeding — `@azure/msal-browser` v6+ may re-arrange the `createNestablePublicClientApplication` API.

**2. Create `.npmrc`** in the repo root (check with `ls .npmrc` first; if it exists, append; if not, create):

```
node-linker=hoisted
```

Rationale (inline comment not supported in .npmrc — record in SUMMARY): pnpm's default isolated linker produces a `node_modules/.pnpm` tree that Next.js's standalone output tracer does not follow correctly. Result: the Plan-05 Azure deploy would ship a standalone bundle missing transitive deps. Flat `node_modules` fixes this (RESEARCH §Pitfalls #10).

**3. Extend `src/config/env.ts` EnvSchema.** Append to the schema object (after `CONTENT_STEWARD_EMAIL`):

```typescript
// Phase-5 Entra ID SSO (AUTH-01, AUTH-03).
//
// SERVER-SIDE keys. Used by `src/app/api/_middleware.ts` (Plan 03) to
// validate JWTs from Entra. Separate from NEXT_PUBLIC_ENTRA_* keys (which
// are inlined into the browser bundle at build time by Next.js) —
// RESEARCH open-question #1 resolves this as the documented Next.js
// pattern: same GUID values, two keys, different visibility.
//
// Optional + default 'dev-only-do-not-use-in-prod' in non-production
// environments so Phase 2/3/4 test suites don't need to stub them.
// Production `loadEnv()` callers must set real values OR an explicit
// production guard elsewhere (checked in Plan 03 _middleware.ts — real
// values are enforced because the JWT verifier would fail otherwise).
ENTRA_CLIENT_ID: z
  .string()
  .min(1)
  .optional()
  .default('dev-only-do-not-use-in-prod'),
ENTRA_TENANT_ID: z
  .string()
  .min(1)
  .optional()
  .default('dev-only-do-not-use-in-prod'),
```

Do NOT add `NEXT_PUBLIC_*` vars to EnvSchema — those are read directly via `process.env.NEXT_PUBLIC_ENTRA_*` from client modules (MSAL config). Next.js inlines them at build time; they never transit `loadEnv()`.

**4. Extend `.env.example`** — append at end of file:

```
# Phase-5 Entra ID SSO (AUTH-01, AUTH-03).
# NEXT_PUBLIC_* are inlined into the browser bundle at build time — used
# by src/auth/msalConfig.ts to build the MSAL PublicClientApplication.
# ENTRA_CLIENT_ID / ENTRA_TENANT_ID (no prefix) are server-only — used by
# src/app/api/_middleware.ts to validate JWT audience + tenant allowlist.
# Same GUID values; two keys per Next.js conventions.
NEXT_PUBLIC_ENTRA_CLIENT_ID=<client-id-guid>
NEXT_PUBLIC_ENTRA_TENANT_ID=<tenant-id-guid>
ENTRA_CLIENT_ID=<client-id-guid>
ENTRA_TENANT_ID=<tenant-id-guid>
```

**5. Extend `src/config/__tests__/env.test.ts`** — add test cases (preserve existing tests):
- `ENTRA_CLIENT_ID` / `ENTRA_TENANT_ID` default to `'dev-only-do-not-use-in-prod'` when absent.
- Custom values flow through `loadEnv({...process.env, ENTRA_CLIENT_ID: 'abc', ENTRA_TENANT_ID: 'def'})`.
- Empty string (`ENTRA_CLIENT_ID: ''`) fails `z.string().min(1)` parse — test for the `ZodError` throw via `loadEnv` error path.
  </action>
  <verify>
`pnpm install` exits 0. `pnpm typecheck` clean. `pnpm test src/config/__tests__/env.test.ts` green. `cat .npmrc` contains `node-linker=hoisted`. `grep -E 'ENTRA_(CLIENT|TENANT)_ID' src/config/env.ts` shows both added.
  </verify>
  <done>
All 5 deps in package.json + lockfile. `.npmrc` has `node-linker=hoisted`. EnvSchema validated. `.env.example` documents both NEXT_PUBLIC_* and server-side keys. Existing env tests still green.
  </done>
</task>

<task type="auto">
  <name>Task 2: detectHost primitive + MSAL config + singleton instance</name>
  <files>
    src/auth/detectHost.ts,
    src/auth/__tests__/detectHost.test.ts,
    src/auth/msalConfig.ts,
    src/auth/msalInstance.ts,
    src/auth/__tests__/msalConfig.test.ts
  </files>
  <action>
Three modules that underpin everything in Plans 02-04. Pure library code — no Next.js pages, no React, no server routes yet.

**1. `src/auth/detectHost.ts`** — Promise.race host detector. Matches RESEARCH Pattern 3 exactly.

```typescript
/**
 * Runtime host detection: are we embedded in a Microsoft Teams tab or
 * running in a plain browser?
 *
 * Detection is done via a Promise.race against a 150ms timeout. The key
 * insight (RESEARCH §Pitfall 2, GitHub teams-js issue #719): when run
 * outside Teams, `microsoftTeams.app.initialize()` NEVER resolves or
 * rejects — it just hangs. So the timeout is the only reliable discriminator.
 *
 * Result is memoised at module level so downstream callers (tokenProvider,
 * Header sign-out) don't re-race on every call.
 *
 * Phase 5 — Plan 05-01 Task 2.
 */
import * as microsoftTeams from '@microsoft/teams-js'

export type Host = 'teams' | 'browser'

const TIMEOUT_MS = 150 // CONTEXT.md "100-200ms — Claude's Discretion". 150ms is mid-range.

let _detected: Host | null = null
let _inflight: Promise<Host> | null = null

export function detectHost(): Promise<Host> {
  if (_detected) return Promise.resolve(_detected)
  if (_inflight) return _inflight

  _inflight = Promise.race<Host>([
    microsoftTeams.app
      .initialize()
      .then(() => 'teams' as const),
    new Promise<Host>((resolve) =>
      setTimeout(() => resolve('browser'), TIMEOUT_MS),
    ),
  ])
    .catch(() => 'browser' as const) // app.initialize() reject → not Teams
    .then((host) => {
      _detected = host
      _inflight = null
      return host
    })

  return _inflight
}

/** Test-only reset. Not exported from barrel; import via relative path in tests. */
export function __resetDetectHostForTests(): void {
  _detected = null
  _inflight = null
}
```

**2. `src/auth/__tests__/detectHost.test.ts`** — two tests covering both paths.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('detectHost', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns 'teams' when microsoftTeams.app.initialize() resolves", async () => {
    vi.doMock('@microsoft/teams-js', () => ({
      app: { initialize: () => Promise.resolve() },
    }))
    const { detectHost } = await import('../detectHost')
    await expect(detectHost()).resolves.toBe('teams')
  })

  it("returns 'browser' when initialize() never resolves within 150ms", async () => {
    vi.doMock('@microsoft/teams-js', () => ({
      app: { initialize: () => new Promise(() => {}) }, // never resolves
    }))
    const { detectHost } = await import('../detectHost')
    await expect(detectHost()).resolves.toBe('browser')
  })

  it('memoises the result across repeat calls', async () => {
    const initialize = vi.fn(() => Promise.resolve())
    vi.doMock('@microsoft/teams-js', () => ({ app: { initialize } }))
    const { detectHost } = await import('../detectHost')
    await detectHost()
    await detectHost()
    await detectHost()
    expect(initialize).toHaveBeenCalledTimes(1)
  })
})
```

**3. `src/auth/msalConfig.ts`** — PublicClientApplication config object. `cacheLocation: 'sessionStorage'` per RESEARCH Pattern 1.

```typescript
/**
 * MSAL PublicClientApplication configuration.
 *
 * Reads NEXT_PUBLIC_ENTRA_CLIENT_ID and NEXT_PUBLIC_ENTRA_TENANT_ID
 * (browser-inlined). The server-side ENTRA_* duplicates (Plan 03) use the
 * same GUID values — RESEARCH open-question #1.
 *
 * cacheLocation='sessionStorage' (NOT localStorage):
 *   - Safer (cleared on tab close)
 *   - RESEARCH recommendation; IndexedDB cache is post-pilot (CONTEXT §Deferred)
 *
 * authority format: 'https://login.microsoftonline.com/${tid}' (NO trailing
 * /v2.0 — MSAL adds that itself; JWT issuer check in Plan 03 does include
 * /v2.0 because that's the claim format — RESEARCH §Pitfall 6).
 *
 * Phase 5 — Plan 05-01 Task 2.
 */
import type { Configuration } from '@azure/msal-browser'

const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID ?? 'dev-only-do-not-use-in-prod'
const tenantId = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID ?? 'dev-only-do-not-use-in-prod'

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    // RESEARCH Pattern 2: the COOP redirect bridge page path. Plan 04 creates
    // the route at src/app/auth/redirect/page.tsx with its own empty layout
    // that does NOT wrap children in MsalProvider.
    redirectUri: typeof window !== 'undefined'
      ? `${window.location.origin}/auth/redirect`
      : '/auth/redirect',
    postLogoutRedirectUri: typeof window !== 'undefined'
      ? window.location.origin
      : '/',
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

/** Scopes requested at sign-in. NAA admin consent must cover these. */
export const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'User.Read'] as const
```

**4. `src/auth/msalInstance.ts`** — singleton pattern. Uses `createNestablePublicClientApplication` (MSAL v5 — RESEARCH §Anti-Patterns rules out `supportsNestedAppAuth: true`).

```typescript
/**
 * Singleton nestable PublicClientApplication.
 *
 * Phase 5 — createNestablePublicClientApplication is the MSAL v5 entry point
 * for Nested App Authentication (NAA). It auto-falls-back to a standard
 * PublicClientApplication when not running inside a Teams host, so the same
 * instance works on both the standalone web client AND inside a Teams tab
 * ("single codebase" invariant — CONTEXT §Auth boundary).
 *
 * MUST only be called from a browser context — touches window / sessionStorage.
 * Calling from a server component (e.g. app/layout.tsx) is a hard error per
 * RESEARCH §Anti-Patterns. AuthProvider (Plan 04) handles this via useEffect
 * / 'use client'.
 */
import type { IPublicClientApplication } from '@azure/msal-browser'
import { createNestablePublicClientApplication } from '@azure/msal-browser'
import { msalConfig } from './msalConfig'

let _instance: IPublicClientApplication | null = null
let _initPromise: Promise<IPublicClientApplication> | null = null

export async function getMsalInstance(): Promise<IPublicClientApplication> {
  if (typeof window === 'undefined') {
    throw new Error(
      'getMsalInstance() must be called in browser context. Do not import from a server component; wrap with "use client".',
    )
  }
  if (_instance) return _instance
  if (_initPromise) return _initPromise

  _initPromise = createNestablePublicClientApplication(msalConfig).then((pca) => {
    _instance = pca
    _initPromise = null
    return pca
  })
  return _initPromise
}

/** Test-only reset. */
export function __resetMsalForTests(): void {
  _instance = null
  _initPromise = null
}
```

**5. `src/auth/__tests__/msalConfig.test.ts`** — shape assertions + env var plumbing.

Test cases:
- `msalConfig.auth.authority` has form `https://login.microsoftonline.com/${tid}` with no trailing `/v2.0`.
- `msalConfig.cache.cacheLocation === 'sessionStorage'`.
- `DEFAULT_SCOPES` includes `openid`, `profile`, `email`, `User.Read`.
- When `NEXT_PUBLIC_ENTRA_TENANT_ID` is set via `vi.stubEnv`, authority reflects it (use `vi.resetModules()` + dynamic import per existing Phase-4 env-test pattern).

DO NOT test `getMsalInstance()` directly in Vitest — it hits `createNestablePublicClientApplication` which internally makes network calls. E2E or a smoke test in Plan 04 covers it. Vitest note this decision in a comment.
  </action>
  <verify>
`pnpm typecheck` clean. `pnpm test src/auth` (all new tests green). Grep for `createNestablePublicClientApplication` in msalInstance.ts returns one match. Grep for `Promise.race` in detectHost.ts returns one match.
  </verify>
  <done>
Three auth library modules exist, typed, tested. No anti-patterns present (no `supportsNestedAppAuth`, no usage of legacy `microsoftTeams.getAuthToken`). Module-level singletons memoise correctly.
  </done>
</task>

</tasks>

<verification>
- `pnpm install` clean; lockfile updated.
- `pnpm typecheck` clean.
- `pnpm test` green (all existing tests + new detectHost, msalConfig, env tests).
- `.npmrc` contains `node-linker=hoisted`.
- `src/auth/detectHost.ts`, `src/auth/msalConfig.ts`, `src/auth/msalInstance.ts` exist and export their documented surfaces.
- Grep `supportsNestedAppAuth` returns no matches (hard-block anti-pattern).
- Grep `microsoftTeams.getAuthToken` returns no matches (hard-block anti-pattern; NAA uses MSAL directly).
- `ENTRA_CLIENT_ID` and `ENTRA_TENANT_ID` in `EnvSchema`; env test proves defaults + value flow.
</verification>

<success_criteria>
- MSAL v5 + jose + teams-js + msal-react installed at the versions locked in RESEARCH §Stack.
- `.npmrc` hoisted linker set — Plan 05 standalone deploy (Pitfall 10) will not silently drop transitive deps.
- `env().ENTRA_CLIENT_ID` / `env().ENTRA_TENANT_ID` available server-side for Plan 03 middleware.
- `detectHost()` handles both `'teams'` and `'browser'` paths with memoisation and 150ms timeout (Pitfall 2).
- `getMsalInstance()` is a singleton; uses NAA-ready factory; errors loudly on server import.
</success_criteria>

<output>
After completion, create `.planning/phases/05-sso-and-teams-delivery/05-01-SUMMARY.md` noting:
- Final installed versions (from `pnpm list`) for the 5 new packages.
- Any deviation from the 150ms `detectHost` timeout (CONTEXT allows 100-200ms).
- Any deviation from the documented `.npmrc` content (e.g. if pre-existing settings are preserved).
- Test-delta count.
</output>
