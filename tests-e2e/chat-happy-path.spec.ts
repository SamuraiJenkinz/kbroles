/**
 * SC #2 — Chat happy path
 *
 * Proves: chip click → streaming answer rendered → citation pill + timestamp
 * + thumbs pair + copy button visible; chip row hidden after first message.
 *
 * Coverage: CHAT-01, CHAT-02, CHAT-03, CHAT-05, CHAT-06, UTIL-01 (Phase-3 SC #2)
 */

import { test, expect } from '@playwright/test'
import { mockPrompts, mockChatSuccess } from './fixtures/mockChat'

test('SC #2 — author chip click → streaming answer + controls + citation + timestamp', async ({
  page,
}) => {
  // Clear sessionStorage so we start fresh (no persisted role)
  await page.addInitScript(() => sessionStorage.clear())
  await mockPrompts(page)
  await page.route('**/api/chat', (route) =>
    mockChatSuccess(route, {
      deltaText:
        'In the Short description field, enter a concise summary of the issue.',
    }),
  )

  await page.goto('/')
  // Pick author role
  await page.getByRole('button', { name: /KB Author/i }).click()
  // Wait for chips to appear, then click the first one
  await expect(page.getByRole('listitem').first()).toBeVisible()
  await page.getByRole('listitem').first().click()

  // Answer text streamed into the assistant bubble
  await expect(page.getByText(/Short description field/i)).toBeVisible()

  // Citation pill rendered — contains the source_id KB0022991
  await expect(page.getByText(/KB0022991/)).toBeVisible()

  // Copy button present (aria-label="Copy answer")
  await expect(page.getByRole('button', { name: /copy answer/i })).toBeVisible()

  // Thumbs up and thumbs down buttons present
  await expect(page.getByRole('button', { name: /^Helpful$/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Not helpful$/i })).toBeVisible()

  // Chip row hidden after first message (ChipRow only renders when messages === 0)
  await expect(page.getByRole('listitem')).toHaveCount(0)

  // Timestamp <time> element present with tabIndex=0 (CHAT-06)
  const timeEl = page.locator('time').first()
  await expect(timeEl).toBeVisible()
  await expect(timeEl).toHaveAttribute('tabindex', '0')
})
