/**
 * Phase 5.1 — BFF auth Playwright fixture.
 *
 * Replaces mockMsal.ts. RESEARCH Pitfall 8 — we cannot seal a real iron-
 * session cookie in test code without exposing SESSION_SECRET, so instead
 * we mock the /api/me network call that AuthProvider fetches on mount. The
 * AuthProvider sees a synthetic 200 response and transitions to
 * status:'authenticated', unblocking ChatPage's render.
 *
 * /api/chat is untouched by this fixture — Playwright specs that hit the
 * chat pipeline also mock /api/chat directly (as Phase 3/4 specs already
 * do) OR run against the dev-permissive middleware stub (local dev +
 * NODE_ENV !== 'production'). The fixture only takes care of the AuthProvider
 * gate.
 *
 * If a future spec exercises /api/logout or /api/login, extend this fixture
 * with additional page.route() calls.
 *
 * Phase 5.1 — Plan 06.
 */
import type { Page } from '@playwright/test'

const DEFAULT_USER = {
  displayName: 'Test User',
  email: 'test@mmc.com',
  oid: 'test-oid-123',
  roles: ['KbAssistant.User'],
}

/**
 * Routes /api/me to a 200 response with a synthetic authenticated user.
 * Call BEFORE page.goto() so the route handler is installed when
 * AuthProvider fires its useEffect fetch.
 */
export async function stubBffAuthenticated(
  page: Page,
  user: Partial<typeof DEFAULT_USER> = {},
): Promise<void> {
  const merged = { ...DEFAULT_USER, ...user }
  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-store' },
      body: JSON.stringify(merged),
    })
  })
}

/**
 * Alternate helper: route /api/me to a 403 forbidden response. Used by a
 * future spec covering the App-Role-missing UX (access-denied page).
 */
export async function stubBffForbidden(
  page: Page,
  upn = 'forbidden-user@mmc.com',
): Promise<void> {
  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'forbidden', upn }),
    })
  })
}
