/**
 * Pitfall regressions — role contamination + refresh draft-only persistence
 *
 * Pitfall 13: change role MID-STREAM must not leak old-role text into new bubble.
 * Pitfall 17: page refresh restores DRAFT only (never message history); role persists.
 *
 * CHECKER Issue 2: The dialog confirm button uses "Change role and clear"
 * (/change role and clear/i) — NOT the popover option "Change role" (/^change role$/i).
 *
 * Coverage: ROLE-04, ROLE-05, AUTH-02, CHAT-05 (Phase-3 Pitfall 13 + Pitfall 17)
 */

import { test, expect } from '@playwright/test'
import { mockPrompts, mockChatSlow, mockChatSuccess } from './fixtures/mockChat'
import { stubMsalAuthenticated } from './fixtures/mockMsal'

test.describe('Pitfall regressions — role contamination + refresh draft-only', () => {
  test.beforeEach(async ({ page }) => {
    // Clear sessionStorage once on first navigation only.
    // We use a flag so that page.reload() within a test does NOT clear
    // sessionStorage (Pitfall 17 test needs role + draft to persist across reload).
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__e2e_initialized')) {
        sessionStorage.clear()
        sessionStorage.setItem('__e2e_initialized', '1')
      }
    })
    // Plan 05-04: ChatPage auth gate. Stubbed AFTER the clear above; MSAL
    // cache keys survive reload within a spec (page.reload preserves
    // sessionStorage) which is correct for Pitfall 17.
    await stubMsalAuthenticated(page)
  })

  test('Pitfall 13 — change role MID-STREAM does not leak old-role text into new bubble', async ({
    page,
  }) => {
    await mockPrompts(page)

    // Track call count and route based on role in the request body
    let callCount = 0
    await page.route('**/api/chat', async (route) => {
      callCount += 1
      const body = route.request().postDataJSON() as { role: string }
      if (callCount === 1 && body.role === 'consumer') {
        return mockChatSlow(route)
      }
      if (callCount === 2 && body.role === 'author') {
        return mockChatSuccess(route, {
          deltaText: 'Author-specific answer for publishing.',
        })
      }
      return route.abort()
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Knowledge Consumer/i }).click()

    // Send a consumer question — slow mock delays 30s (effectively hangs)
    await page.getByRole('textbox').fill('long consumer question')
    await page.getByRole('button', { name: /send message/i }).click()

    // isStreaming=true immediately after send; Stop button appears
    await expect(
      page.getByRole('button', { name: /stop response/i }),
    ).toBeVisible()

    // MID-STREAM: Open role pill popover and change role
    // The header pill trigger for "Knowledge Consumer" opens the popover
    await page.getByRole('button', { name: /Knowledge Consumer/i }).click()

    // Popover option "Change role" (opens the dialog) — selector: /^change role$/i
    await page.getByRole('button', { name: /^change role$/i }).click()

    // CHECKER Issue 2: dialog confirm "Change role and clear" — CONFIRMS the change
    await page.getByRole('button', { name: /change role and clear/i }).click()

    // Back on RoleSelect; pick Author
    await page.getByRole('button', { name: /KB Author/i }).click()

    // Send an author question
    await page.getByRole('textbox').fill('Author question')
    await page.getByRole('button', { name: /send message/i }).click()

    // New bubble contains ONLY the author answer — zero leakage from the aborted consumer stream.
    // The consumer request was aborted mid-flight (no delta was delivered),
    // so any consumer text must not appear in the author bubble.
    await expect(
      page.getByText(/Author-specific answer for publishing/i),
    ).toBeVisible()

    // No consumer-role partial text leaked into the author bubble
    await expect(page.getByText(/Start of a long answer/i)).toHaveCount(0)

    // Exactly 2 API calls were made (one per send — consumer was aborted before response)
    expect(callCount).toBe(2)
  })

  test('Pitfall 17 — refresh restores DRAFT but not message history; role persists', async ({
    page,
  }) => {
    await mockPrompts(page)
    await page.route('**/api/chat', (route) => mockChatSuccess(route))

    await page.goto('/')
    await page.getByRole('button', { name: /Knowledge Consumer/i }).click()

    // Type a draft but do NOT send
    await page.getByRole('textbox').fill('draft in progress — do not lose me')

    // Wait past the 250ms debounce so sessionStorage is written
    await page.waitForTimeout(400)

    // Refresh — draft should be restored
    await page.reload()

    // Role persisted (still on consumer chat surface, not RoleSelect)
    await expect(
      page.getByText(/flagging articles, leaving feedback/i),
    ).toBeVisible()

    // Draft restored from sessionStorage
    await expect(page.getByRole('textbox')).toHaveValue(
      'draft in progress — do not lose me',
    )

    // Send a real message, then refresh again
    await page.getByRole('textbox').fill('my question')
    await page.getByRole('button', { name: /send message/i }).click()
    await expect(page.getByText(/flag an article/i)).toBeVisible()

    await page.reload()

    // Messages wiped (AUTH-02 — history not persisted across refresh).
    // Use the full answer text to avoid matching chip labels ("How do I flag an article?")
    await expect(
      page.getByText(/flag an article by clicking/i),
    ).toHaveCount(0)
    await expect(page.getByText(/my question/)).toHaveCount(0)

    // Draft cleared on send, so textbox is empty after reload
    await expect(page.getByRole('textbox')).toHaveValue('')

    // Role still persisted (kbroles.role in sessionStorage)
    await expect(
      page.getByText(/flagging articles, leaving feedback/i),
    ).toBeVisible()
  })
})
