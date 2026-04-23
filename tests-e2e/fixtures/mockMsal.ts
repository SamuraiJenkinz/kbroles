/**
 * Playwright fixture — seeds MSAL v5 sessionStorage with a synthetic
 * authenticated account BEFORE the app bootstraps, so useIsAuthenticated()
 * returns true in Phase-3/4 Playwright specs without driving a real Entra
 * redirect.
 *
 * MSAL v5 BrowserCacheManager cache-key format (verified against
 * node_modules/@azure/msal-browser/dist/cache/BrowserCacheManager.mjs
 * ::generateAccountKey + CacheKeys.mjs):
 *
 *   - Account list pointer:  `msal.3.account.keys`           (JSON array)
 *   - Account entity key:    `msal.3|<home>|<env>|<tenant>`  (pipe-separated,
 *                                                              lowercase)
 *   - Token list pointer:    `msal.3.token.keys.<clientId>`  (JSON array)
 *
 * where schema version `3` is the current ACCOUNT_SCHEMA_VERSION constant.
 *
 * This fixture does NOT seed idToken/accessToken entities — specs that hit
 * /api/chat through Playwright mocks never exercise acquireTokenSilent
 * against the cache, so the account pointer alone is enough to unblock
 * ChatPage's auth gate.
 *
 * If acquireTokenSilent IS exercised in a future spec, extend this fixture
 * to seed a non-expired idToken entity under `msal.3.token.keys.<clientId>`.
 *
 * Tenant/client GUIDs use dev placeholders distinct from the
 * `dev-only-do-not-use-in-prod` string env default (so the ChatPage
 * wrong-tenant gate — which explicitly no-ops on the placeholder — stays
 * correct, and MSAL's account-key normalisation produces a clean path).
 *
 * Phase 5 — Plan 05-04 Task 2.
 */
import type { Page } from '@playwright/test'

export async function stubMsalAuthenticated(page: Page): Promise<void> {
  const TEST_TENANT = '11111111-1111-1111-1111-111111111111'
  const TEST_CLIENT = '22222222-2222-2222-2222-222222222222'
  const LOCAL_ACCOUNT = '33333333-3333-3333-3333-333333333333'
  const HOME_ACCOUNT = `${LOCAL_ACCOUNT}.${TEST_TENANT}`
  const ENVIRONMENT = 'login.windows.net'

  await page.addInitScript(
    ({ TEST_TENANT, TEST_CLIENT, LOCAL_ACCOUNT, HOME_ACCOUNT, ENVIRONMENT }) => {
      // Matches BrowserCacheManager.generateAccountKey — lower-case
      // pipe-separated: msal.3|<home>|<env>|<home-tenant-from-home-account>
      const homeTenant = HOME_ACCOUNT.split('.')[1] || TEST_TENANT
      const accountKey = [
        'msal.3',
        HOME_ACCOUNT,
        ENVIRONMENT,
        homeTenant,
      ].join('|').toLowerCase()

      const accountEntity = {
        homeAccountId: HOME_ACCOUNT,
        environment: ENVIRONMENT,
        realm: TEST_TENANT,
        tenantId: TEST_TENANT,
        username: 'test-user@mmc.com',
        localAccountId: LOCAL_ACCOUNT,
        authorityType: 'MSSTS',
        clientInfo: '',
        name: 'Test User',
        idTokenClaims: {
          tid: TEST_TENANT,
          oid: LOCAL_ACCOUNT,
          preferred_username: 'test-user@mmc.com',
          iss: `https://login.microsoftonline.com/${TEST_TENANT}/v2.0`,
          aud: TEST_CLIENT,
        },
      }
      sessionStorage.setItem(accountKey, JSON.stringify(accountEntity))
      // ACCOUNT_SCHEMA_VERSION = 3 → pointer key `msal.3.account.keys`
      sessionStorage.setItem('msal.3.account.keys', JSON.stringify([accountKey]))
      sessionStorage.setItem(`msal.3.token.keys.${TEST_CLIENT}`, JSON.stringify([]))
      // Test-only bypass for tokenProvider.acquireToken. When this symbol is
      // set, tokenProvider short-circuits and returns the value verbatim
      // without driving a real MSAL acquireTokenSilent (which would fail
      // without seeded idToken entities and cascade into an
      // acquireTokenRedirect → external Entra navigation → spec timeout).
      // Paired with src/auth/tokenProvider.ts's window.__E2E_MSAL_TOKEN__
      // read guard. Production builds never see this symbol.
      ;(window as unknown as { __E2E_MSAL_TOKEN__?: string }).__E2E_MSAL_TOKEN__ =
        'e2e-bearer-placeholder'
    },
    { TEST_TENANT, TEST_CLIENT, LOCAL_ACCOUNT, HOME_ACCOUNT, ENVIRONMENT },
  )
}
