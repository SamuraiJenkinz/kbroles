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
    redirectUri:
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/redirect`
        : '/auth/redirect',
    postLogoutRedirectUri:
      typeof window !== 'undefined' ? window.location.origin : '/',
    // NOTE: `navigateToLoginRequestUrl` was dropped from MSAL v5's
    // BrowserAuthOptions type. MSAL's default behaviour after
    // handleRedirectPromise() is to return the user to the originally
    // requested URL (captured in state), which is exactly what we want;
    // no explicit flag needed.
  },
  cache: {
    cacheLocation: 'sessionStorage',
    // NOTE: `storeAuthStateInCookie` was dropped from MSAL v5's CacheOptions
    // type. The cookie-fallback feature was IE11-era; MSAL v5 targets
    // evergreen browsers only (Edge Chromium / Chrome / Firefox / Safari),
    // all of which support sessionStorage reliably.
  },
}

/** Scopes requested at sign-in. NAA admin consent must cover these. */
export const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'User.Read'] as const
