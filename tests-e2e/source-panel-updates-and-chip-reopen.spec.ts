import { test, expect } from '@playwright/test'
import { mockPrompts, mockConfig, mockSources } from './fixtures/mockChat'

test('SC #2 — Panel updates on follow-up citation; chip click re-opens for older message', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear()
    localStorage.setItem('about_tooltip_seen_v1', 'true')
  })
  await mockPrompts(page)
  await mockConfig(page)
  await mockSources(page)

  // First POST cites KB0020882; second POST cites KB0022991. Use a counter on route.
  let chatCallCount = 0
  await page.route('**/api/chat', async (route) => {
    chatCallCount += 1
    const frames =
      chatCallCount === 1
        ? [
            `data: ${JSON.stringify({ type: 'answer_delta', text: 'See the Resolution section.' })}\n\n`,
            `data: ${JSON.stringify({ type: 'citations', citations: [{ source_id: 'KB0020882', section_id: 'resolution-field-software', quote: 'Configuration Item' }] })}\n\n`,
            `data: ${JSON.stringify({ type: 'done', can_answer: true, validator_flips: 0 })}\n\n`,
          ]
        : [
            `data: ${JSON.stringify({ type: 'answer_delta', text: 'Publishing requires three approvals.' })}\n\n`,
            `data: ${JSON.stringify({ type: 'citations', citations: [{ source_id: 'KB0022991', section_id: 'publishing-approval', quote: 'Knowledge-Owner' }] })}\n\n`,
            `data: ${JSON.stringify({ type: 'done', can_answer: true, validator_flips: 0 })}\n\n`,
          ]
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Request-Id': 'req-e2e' },
      body: frames.join(''),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /KB Author/i }).click()
  await page.getByRole('textbox').fill('What goes in the Resolution field?')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/See the Resolution section/)).toBeVisible()

  // Scope panel selector via aria-labelledby (set by Plan 02 SourcePanel) —
  // avoids strict-mode collision with AboutPopover / ChangeRoleDialog which
  // also have role="dialog".
  const panel = page.locator('[aria-labelledby="source-panel-title"]')
  // The Dialog.Title also shows the section name, so use the body section id to
  // confirm the first source loaded without strict-mode collision from two h2s.
  await expect(panel.locator('#resolution-field-software')).toBeVisible()

  // Send a second question
  await page.getByRole('textbox').fill('Who approves articles?')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Publishing requires three approvals/)).toBeVisible()

  // Panel stayed open AND updated to new section
  await expect(panel).toBeVisible()
  // Confirm panel updated: the publishing section id is now present in the body
  await expect(panel.locator('#publishing-approval')).toBeVisible()

  // Click the FIRST message's citation chip (for KB0020882/resolution-field-software)
  // Chips are buttons with aria-label containing "Open source KB0020882 —".
  await page.getByRole('button', { name: /Open source KB0020882/ }).first().click()

  // Panel re-loads the older source (resolution-field-software section)
  await expect(panel.locator('#resolution-field-software')).toBeVisible()
})
