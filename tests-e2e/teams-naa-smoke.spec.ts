import { test, expect } from '@playwright/test'
// Reuses the Plan 05-04 mockMsal fixture (created by 05-04 Task 2 sub-step 6).
import { stubMsalAuthenticated } from './fixtures/mockMsal'

/**
 * Automated portion of the Pitfall-9 NAA smoke. Playwright runs in a real
 * browser, so `detectHost()` always resolves to `'browser'` naturally —
 * this spec uses `?host=teams` + `window.__STUB_TEAMS__` to exercise the
 * codepath detectHost takes when the Teams bridge claims it's present.
 *
 * The REAL full-client matrix (Teams desktop Win/macOS, Teams web
 * Edge/Chrome, Teams mobile iOS/Android) is manual; see teams/README.md
 * "Pitfall-9 manual test matrix" and Plan 05-05 Task 3 checkpoint Gate C.
 *
 * Phase 5 — Plan 05-05 Task 2.
 */
test('chat surface renders under ?host=teams with detectHost stubbed to teams', async ({
  page,
}) => {
  await stubMsalAuthenticated(page)
  await page.addInitScript(() => {
    ;(window as unknown as { __STUB_TEAMS__?: boolean }).__STUB_TEAMS__ = true
  })
  await page.goto('/?host=teams')
  // Role select appears — host detection does NOT block rendering.
  await expect(page.getByRole('heading', { name: /Knowledge Consumer/i })).toBeVisible()
})
