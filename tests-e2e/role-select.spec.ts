/**
 * SC #1 — Role select landing
 *
 * Proves: both role cards visible, consumer pick loads 5 chips + correct greeting,
 * author pick loads 8 chips + correct greeting, returning-user skips role-select.
 *
 * Coverage: ROLE-01, ROLE-02, ROLE-03 (Phase-3 SC #1)
 */

import { test, expect } from '@playwright/test'
import { mockPrompts } from './fixtures/mockChat'

test.describe('SC #1 — Role select landing', () => {
  test.beforeEach(async ({ page }) => {
    // Clear sessionStorage so every test starts as a new user.
    // Phase 4 auto-fix: also suppress the About popover (Phase 4 Phase-4 ships
    // useAboutTooltip which auto-opens on first visit and adds 3 <li> items to
    // the DOM — counted by getByRole('listitem') alongside chip listitems).
    await page.addInitScript(() => {
      sessionStorage.clear()
      localStorage.setItem('about_tooltip_seen_v1', 'true')
    })
    await mockPrompts(page)
  })

  test('shows two role cards on first visit', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('button', { name: /Knowledge Consumer/i }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /KB Author/i }),
    ).toBeVisible()
  })

  test('consumer pick → greeting + 5 chips', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Knowledge Consumer/i }).click()
    // Greeting text for consumer role
    await expect(
      page.getByText(/flagging articles, leaving feedback/i),
    ).toBeVisible()
    // 5 chip buttons in the ChipRow (role="listitem" on each button)
    await expect(page.getByRole('listitem')).toHaveCount(5)
  })

  test('author pick → greeting + 8 chips', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /KB Author/i }).click()
    // Greeting text for author role
    await expect(
      page.getByText(/authoring and publishing articles/i),
    ).toBeVisible()
    // 8 chip buttons in the ChipRow
    await expect(page.getByRole('listitem')).toHaveCount(8)
  })

  test('returning user (sessionStorage seeded) skips role-select', async ({ page }) => {
    // Seed sessionStorage before the page loads using addInitScript
    await page.addInitScript(() => {
      sessionStorage.setItem('kbroles.role', 'author')
    })
    await page.goto('/')
    // Should land directly on the author chat surface, not role-select
    await expect(
      page.getByText(/authoring and publishing articles/i),
    ).toBeVisible()
    // Role-select cards should NOT be visible
    await expect(
      page.getByRole('button', { name: /Knowledge Consumer/i }),
    ).toHaveCount(0)
  })
})
