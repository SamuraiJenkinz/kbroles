/**
 * SC #5 — Copy with exact citation suffix + thumbs-down fixed-option radio
 *
 * Proves: Copy button writes the exact UTIL-01 format
 * "<answer text>\n\n(Source: KB0022991 · Flagging Articles)" to the clipboard.
 * Thumbs-down opens a panel with exactly 4 radio options and NO textarea/text input.
 *
 * Requires clipboard permissions — granted via test.use below.
 *
 * Coverage: UTIL-01, FDBK-01, FDBK-02 (Phase-3 SC #5)
 */

import { test, expect } from '@playwright/test'
import { mockPrompts, mockChatSuccess } from './fixtures/mockChat'
import { stubMsalAuthenticated } from './fixtures/mockMsal'

test.use({
  permissions: ['clipboard-read', 'clipboard-write'],
})

test.describe('SC #5 — Copy with citation suffix + thumbs-down fixed-option radio', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.clear())
    await stubMsalAuthenticated(page)  // Plan 05-04: ChatPage auth gate
  })

  test('Copy writes exact UTIL-01 format including (Source: KB0022991 · Flagging Articles)', async ({
    page,
  }) => {
    await mockPrompts(page)
    await page.route('**/api/chat', (route) =>
      mockChatSuccess(route, {
        deltaText: 'Click the flag icon in the article header.',
      }),
    )

    await page.goto('/')
    await page.getByRole('button', { name: /Knowledge Consumer/i }).click()

    await page.getByRole('textbox').fill('How do I flag?')
    await page.getByRole('button', { name: /send message/i }).click()
    await expect(page.getByText(/Click the flag icon/i)).toBeVisible()

    // Click the Copy button (aria-label="Copy answer")
    await page.getByRole('button', { name: /copy answer/i }).click()

    // Read clipboard and assert exact UTIL-01 format.
    // Normalize CRLF → LF and trim each line so platform whitespace differences
    // (Windows clipboard may pad lines) do not affect the semantic assertion.
    const clipped = await page.evaluate(() => navigator.clipboard.readText())
    // Normalize: CRLF → LF, then trim trailing whitespace from each line
    const normalized = clipped
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
    expect(normalized).toBe(
      'Click the flag icon in the article header.\n\n(Source: KB0022991 · Flagging Articles)',
    )
  })

  test('Thumbs-down opens panel with 4 radio options, NO free-text input', async ({
    page,
  }) => {
    await mockPrompts(page)
    await page.route('**/api/chat', (route) => mockChatSuccess(route))

    await page.goto('/')
    await page.getByRole('button', { name: /Knowledge Consumer/i }).click()

    await page.getByRole('textbox').fill('question')
    await page.getByRole('button', { name: /send message/i }).click()
    await expect(page.getByText(/flag an article/i)).toBeVisible()

    // Click thumbs-down (aria-label="Not helpful")
    await page.getByRole('button', { name: /^Not helpful$/i }).click()

    // Feedback panel appears as a region
    const region = page.getByRole('region', {
      name: /why was this answer not helpful/i,
    })
    await expect(region).toBeVisible()

    // Exactly 4 radio options (Hallucinated, Wrong citation, Incomplete, Other)
    await expect(region.getByRole('radio')).toHaveCount(4)

    // No textarea or text input inside the feedback panel (FDBK-02 — no free text)
    await expect(region.locator('textarea')).toHaveCount(0)
    await expect(region.locator('input[type="text"]')).toHaveCount(0)

    // Select "Wrong citation" — panel closes after selection
    await region.getByRole('radio', { name: /wrong citation/i }).click()
    await expect(region).toHaveCount(0)
  })
})
