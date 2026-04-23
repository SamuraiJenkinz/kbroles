import { test, expect } from '@playwright/test'
import { mockPrompts, mockConfig, mockSources, mockChatWithCitations } from './fixtures/mockChat'
import { stubBffAuthenticated } from './fixtures/mockSession'

test('SC #3 — Panel footer permalink + colour-coded badges + Pitfall 16/19 invariants', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear()
    localStorage.setItem('about_tooltip_seen_v1', 'true')
  })
  await stubBffAuthenticated(page)  // Plan 05.1-06: ChatPage auth gate (BFF /api/me route-mock)
  await mockPrompts(page)
  await mockConfig(page)
  await mockSources(page)
  await mockChatWithCitations(page, {
    deltaText: 'Resolution details here.',
    citations: [
      { source_id: 'KB0020882', section_id: 'resolution-field-software', quote: 'Configuration Item' },
    ],
  })

  await page.goto('/')
  await page.getByRole('button', { name: /KB Author/i }).click()
  await page.getByRole('textbox').fill('resolution?')
  await page.keyboard.press('Enter')

  // Scope panel selector via data-source-panel (set by SourcePanel) —
  // avoids strict-mode collision with AboutPopover / ChangeRoleDialog which
  // also have role="dialog". Radix auto-wires Dialog.Title↔Dialog.Content;
  // overriding id/aria-labelledby would break the wiring and fire the
  // "DialogContent requires a DialogTitle" dev warning.
  const panel = page.locator('[data-source-panel="true"]')
  await expect(panel).toBeVisible()

  // SC #3 — Footer permalink
  const permalink = panel.getByRole('link', { name: /Open in ServiceNow/i })
  await expect(permalink).toHaveAttribute(
    'href',
    'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0020882',
  )
  await expect(permalink).toHaveAttribute('target', '_blank')
  await expect(permalink).toHaveAttribute('rel', /noopener/)

  // SC #3 — Header badge colour-coded (blue for KB0020882)
  // Badge aria-label = "Source KB0020882 — Resolution Field — Software (11-point)"
  const badge = panel.getByLabel(/Source KB0020882/)
  await expect(badge).toHaveClass(/bg-blue-50/)

  // Pitfall 16: icon + colour on EVERY colour-coded element.
  //   a) Panel header badge has colour class AND SVG child
  await expect(badge.locator('svg').first()).toBeVisible()

  //   b) Chat citation chip has colour class AND SVG child
  const chip = page.getByRole('button', { name: /Open source KB0020882/ }).first()
  await expect(chip).toHaveClass(/bg-blue-50/)
  await expect(chip.locator('svg').first()).toBeVisible()

  // Pitfall 19: section DOM id = REGISTRY section_id, NOT heading slug
  //   (heading slug of "Resolution Field — Software" would be
  //    "resolution-field-software" BY COINCIDENCE here — so assert the literal
  //    registry-authored anchor id and NOT any alternative like
  //    "resolution-field-a-software" or "resolution-field-emdash-software".)
  await expect(panel.locator('#resolution-field-software')).toBeVisible()
})
