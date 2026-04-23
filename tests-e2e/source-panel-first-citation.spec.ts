import { test, expect } from '@playwright/test'
import { mockPrompts, mockConfig, mockSources, mockChatWithCitations } from './fixtures/mockChat'
import { stubMsalAuthenticated } from './fixtures/mockMsal'

test('SC #1 — Author "Resolution field" → panel auto-opens to KB0020882 with blue badge + section body', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear()
    localStorage.setItem('about_tooltip_seen_v1', 'true')  // suppress About popover flash
  })
  await stubMsalAuthenticated(page)  // Plan 05-04: ChatPage auth gate
  await mockPrompts(page)
  await mockConfig(page)
  await mockSources(page)
  await mockChatWithCitations(page, {
    deltaText: 'The Resolution field must include Configuration Item, Assignment group, and OPCO.',
    citations: [
      { source_id: 'KB0020882', section_id: 'resolution-field-software', quote: 'Configuration Item' },
    ],
  })

  await page.goto('/')
  await page.getByRole('button', { name: /KB Author/i }).click()
  await page.getByRole('textbox').fill('What goes in the Resolution field?')
  await page.keyboard.press('Enter')

  // Answer rendered
  await expect(page.getByText(/Configuration Item, Assignment group/)).toBeVisible()

  // Panel auto-opened. Scope to the SourcePanel specifically via the
  // data-source-panel attribute — NOT `getByRole('dialog')` alone, which
  // would also match Radix Popover (AboutPopover) and ChangeRoleDialog and
  // fail in strict mode. Radix auto-wires Dialog.Title↔Dialog.Content via
  // its own generated titleId; overriding id/aria-labelledby breaks that
  // wiring and fires "DialogContent requires a DialogTitle" in dev.
  const panel = page.locator('[data-source-panel="true"]')
  await expect(panel).toBeVisible()

  // Header badge shows KB0020882 with blue colour — Pitfall 16: both class AND icon.
  // Badge aria-label = "Source KB0020882 — Resolution Field — Software (11-point)"
  const badge = panel.getByLabel(/Source KB0020882/)
  await expect(badge).toBeVisible()
  await expect(badge).toHaveClass(/bg-blue-50/)
  await expect(badge.locator('svg').first()).toBeVisible()

  // Body contains the section content + rendered body text (from mockSources fixture).
  // Note: the Dialog.Title also renders the section name — scope text assertion to
  // the body area (the #resolution-field-software section div) to avoid strict-mode
  // violation from two headings matching the same text (panel header + body h2).
  await expect(panel.locator('#resolution-field-software')).toBeVisible()
  await expect(panel.getByText(/Assignment group/)).toBeVisible()

  // Pitfall 19: the highlighted section element has the REGISTRY section_id as DOM id
  await expect(panel.locator('#resolution-field-software')).toBeVisible()
})
