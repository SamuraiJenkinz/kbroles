import { test, expect } from '@playwright/test'
import { mockPrompts, mockConfig, mockSources } from './fixtures/mockChat'
import { stubMsalAuthenticated } from './fixtures/mockMsal'

test('SC #5 — Freshness line + first-run About tooltip + dismiss persists', async ({ page }) => {
  // Clear BOTH sessionStorage AND localStorage once on the FIRST page load.
  // Guard key stored in sessionStorage (not a window property) — sessionStorage
  // persists across page.reload() within the same tab, so the guard correctly
  // prevents re-clearing on reload (Phase 3 Plan 03-06 established this pattern).
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__e2e_initialized')) {
      sessionStorage.clear()
      localStorage.clear()
      sessionStorage.setItem('__e2e_initialized', '1')
    }
  })
  await stubMsalAuthenticated(page)  // Plan 05-04: ChatPage auth gate
  await mockPrompts(page)
  await mockConfig(page)
  await mockSources(page)

  await page.goto('/')
  await page.getByRole('button', { name: /Knowledge Consumer/i }).click()

  // SC #5 — freshness line format.
  // FreshnessLine is `hidden sm:inline` — at Playwright default viewport (1280x720)
  // the sm breakpoint (640px) is active so the full text is rendered inline.
  // The span contains the text directly as its text content.
  await expect(page.getByText(
    /Grounded in KB0022991 v13\.0 · KB0020882 v9\.0 · Form schema 2026-04-23/
  )).toBeVisible()

  // SC #5 — About tooltip auto-opens on first visit.
  // Radix Popover.Content renders with role="dialog".
  // AboutPopover has aria-labelledby="about-popover-title" (id on the h3 inside).
  // Query by role dialog with the accessible name from that h3.
  const popover = page.getByRole('dialog', { name: /About this assistant/i })
  await expect(popover).toBeVisible()
  await expect(popover).toContainText(/What I can answer/i)
  await expect(popover).toContainText(/What I can't/i)
  await expect(popover).toContainText(/How to flag a gap/i)

  // Dismiss via "Got it"
  await popover.getByRole('button', { name: /Got it/i }).click()
  await expect(popover).not.toBeVisible()

  // Reload the page — tooltip MUST stay closed (localStorage persisted).
  // The addInitScript guard (__e2e_initialized) ensures reload doesn't re-clear storage.
  await page.reload()
  // Wait for the header to re-render with freshness line
  await expect(page.getByText(/Grounded in KB0022991/)).toBeVisible()
  await expect(page.getByRole('dialog', { name: /About this assistant/i })).not.toBeVisible()

  // Click ℹ icon — popover re-opens (always-available).
  // The ℹ button has aria-label="About this assistant" in Header.tsx
  await page.getByRole('button', { name: /About this assistant/i }).click()
  await expect(page.getByRole('dialog', { name: /About this assistant/i })).toBeVisible()
})
