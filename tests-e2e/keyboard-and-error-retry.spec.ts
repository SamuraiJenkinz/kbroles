/**
 * SC #4 — Keyboard input + error card + retry
 *
 * Proves: Enter submits; Shift+Enter inserts newline (no submit);
 * a 5xx server error renders ErrorCard with Retry button + Details expansion;
 * Retry successfully re-sends and shows the happy-path answer.
 *
 * Coverage: CHAT-03, CHAT-07, FDBK-01 (Phase-3 SC #4)
 */

import { test, expect } from '@playwright/test'
import { mockPrompts, mockChatSuccess, mockChatError } from './fixtures/mockChat'
import { stubMsalAuthenticated } from './fixtures/mockMsal'

test.describe('SC #4 — Keyboard + error + retry', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.clear())
    await stubMsalAuthenticated(page)  // Plan 05-04: ChatPage auth gate
  })

  test('Enter submits; Shift+Enter inserts newline without submitting', async ({
    page,
  }) => {
    await mockPrompts(page)
    await page.route('**/api/chat', (route) => mockChatSuccess(route))

    await page.goto('/')
    await page.getByRole('button', { name: /Knowledge Consumer/i }).click()

    const input = page.getByRole('textbox')
    await input.focus()

    // Shift+Enter: newline, NO submit
    await page.keyboard.down('Shift')
    await page.keyboard.press('Enter')
    await page.keyboard.up('Shift')
    await input.type('second line')

    // Value should contain a newline before 'second line'
    const val = await input.inputValue()
    expect(val).toContain('\n')
    expect(val).toContain('second line')

    // Enter alone should submit and produce an answer
    await page.keyboard.press('Enter')
    await expect(page.getByText(/flag an article/i)).toBeVisible()
  })

  test('Server 5xx → ErrorCard with Retry → successful retry', async ({
    page,
  }) => {
    await mockPrompts(page)
    let hits = 0
    await page.route('**/api/chat', async (route) => {
      hits += 1
      if (hits === 1) return mockChatError(route)
      return mockChatSuccess(route)
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Knowledge Consumer/i }).click()

    await page.getByRole('textbox').fill('What is happening?')
    await page.getByRole('button', { name: /send message/i }).click()

    // ErrorCard renders with role="alert" — filter to the visible error card
    // (Next.js also has a route-announcer with role="alert" that is empty/hidden)
    const errorCard = page
      .getByRole('alert')
      .filter({ hasText: /temporarily unavailable|took too long|could not format|Something went wrong/i })
    await expect(errorCard).toBeVisible()

    // Retry button visible inside the error card
    const retry = page.getByRole('button', { name: /^retry$/i })
    await expect(retry).toBeVisible()

    // Expand Details to see the request ID (CHAT-07 + bug-report affordance)
    const detailsBtn = page.getByRole('button', { name: /^details$/i })
    await expect(detailsBtn).toBeVisible()
    await detailsBtn.click()
    await expect(page.getByText(/Request ID:/i)).toBeVisible()

    // Click Retry — second mock returns happy path
    await retry.click()
    await expect(page.getByText(/flag an article/i)).toBeVisible()

    // User question appears exactly ONCE (no duplicate on retry — CHAT-07)
    await expect(page.getByText('What is happening?')).toHaveCount(1)
  })
})
