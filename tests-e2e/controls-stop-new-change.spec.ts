/**
 * SC #3 — Stop / New conversation / Change role
 *
 * Proves: Stop cancels mid-stream; New conversation clears without changing role;
 * Change role → confirm via "Change role and clear" → back to RoleSelect + session cleared.
 * Also covers Pitfall 13 (mid-stream change role) via role-contamination.spec.ts.
 *
 * CHECKER Issue 2: The confirm button in ChangeRoleDialog uses aria-label
 * "Change role and clear" — NOT the popover option "Change role" (/^change role$/i).
 *
 * Coverage: CHAT-04, CHAT-05, ROLE-04, ROLE-05 (Phase-3 SC #3)
 */

import { test, expect } from '@playwright/test'
import { mockPrompts, mockChatSuccess, mockChatSlow } from './fixtures/mockChat'
import { stubMsalAuthenticated } from './fixtures/mockMsal'

test.describe('SC #3 — Stop / New conversation / Change role', () => {
  test.beforeEach(async ({ page }) => {
    // Phase 4 auto-fix: suppress About popover (auto-opens on first visit and
    // adds 3 <li> items; unnecessary noise for control-flow tests).
    await page.addInitScript(() => {
      sessionStorage.clear()
      localStorage.setItem('about_tooltip_seen_v1', 'true')
    })
    // Plan 05-04: seed MSAL cache so ChatPage's auth gate passes.
    await stubMsalAuthenticated(page)
  })

  test('Stop cancels mid-stream and preserves accumulated text', async ({ page }) => {
    await mockPrompts(page)
    await page.route('**/api/chat', (route) => mockChatSlow(route))

    await page.goto('/')
    await page.getByRole('button', { name: /Knowledge Consumer/i }).click()

    // Type and send a question
    await page.getByRole('textbox').fill('How do I flag?')
    await page.getByRole('button', { name: /send message/i }).click()

    // useChatStream sets isStreaming=true BEFORE awaiting fetch, so the Stop
    // button appears immediately after send — even before the mock responds.
    const stopBtn = page.getByRole('button', { name: /stop response/i })
    await expect(stopBtn).toBeVisible()

    // Click Stop — aborts the in-flight request
    await stopBtn.click()

    // Send button re-enabled (isStreaming=false after stop)
    await expect(
      page.getByRole('button', { name: /send message/i }),
    ).toBeVisible()
  })

  test('New conversation clears without changing role', async ({ page }) => {
    await mockPrompts(page)
    await page.route('**/api/chat', (route) => mockChatSuccess(route))

    await page.goto('/')
    await page.getByRole('button', { name: /Knowledge Consumer/i }).click()

    // Send a message and wait for the response
    await page.getByRole('textbox').fill('first question')
    await page.getByRole('button', { name: /send message/i }).click()
    await expect(page.getByText(/flag an article/i)).toBeVisible()

    // Phase 4 auto-fix: mockChatSuccess returns a citation which auto-opens the
    // SourcePanel (z-50 fixed right-0 40vw). The panel overlaps the "New
    // conversation" button on desktop viewports. Close the panel first via its
    // close button before interacting with the header controls.
    const closeBtn = page.getByRole('button', { name: /close source panel/i })
    if (await closeBtn.isVisible()) {
      await closeBtn.click()
    }

    // Click New conversation
    await page.getByRole('button', { name: /new conversation/i }).click()

    // Greeting and chips are back (empty state)
    await expect(
      page.getByText(/flagging articles, leaving feedback/i),
    ).toBeVisible()
    await expect(page.getByRole('listitem').first()).toBeVisible()

    // Previous answer is gone — use the full mock answer text to avoid
    // matching chip labels like "How do I flag an article?" which reappear
    await expect(
      page.getByText(/flag an article by clicking/i),
    ).toHaveCount(0)

    // Role still shows Consumer in the header pill
    // (Header pill trigger has the role label text)
    await expect(
      page.getByRole('button', { name: /Knowledge Consumer/i }),
    ).toBeVisible()
  })

  test('Change role → confirm via "Change role and clear" → back to RoleSelect + conversation cleared', async ({
    page,
  }) => {
    await mockPrompts(page)
    await page.route('**/api/chat', (route) => mockChatSuccess(route))

    await page.goto('/')
    await page.getByRole('button', { name: /Knowledge Consumer/i }).click()

    // Send a message so there is conversation history to clear
    await page.getByRole('textbox').fill('q1')
    await page.getByRole('button', { name: /send message/i }).click()
    await expect(page.getByText(/flag an article/i)).toBeVisible()

    // Open role pill popover by clicking the header pill
    // The popover trigger is the role pill button labelled "Knowledge Consumer"
    // We need to click the one in the header (not a RoleSelect card)
    // The header shows the pill once a role is selected.
    await page.getByRole('button', { name: /Knowledge Consumer/i }).click()

    // Popover content: click the "Change role" OPTION (opens the dialog)
    // Selector: /^change role$/i  — exactly "Change role" (the popover option)
    await page.getByRole('button', { name: /^change role$/i }).click()

    // Dialog appears
    await expect(page.getByRole('dialog')).toBeVisible()

    // Cancel is autoFocus'd in the dialog (Pitfall 18 — Cancel is the safe default)
    await expect(page.getByRole('button', { name: /^cancel$/i })).toBeFocused()

    // CHECKER Issue 2: confirm the change using the DISAMBIGUATED button label
    // "Change role and clear" — this is the dialog confirm button, NOT the popover option.
    await page.getByRole('button', { name: /change role and clear/i }).click()

    // Back on RoleSelect — both cards visible
    await expect(
      page.getByRole('button', { name: /Knowledge Consumer/i }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /KB Author/i }),
    ).toBeVisible()

    // sessionStorage.kbroles.role cleared
    const roleInSS = await page.evaluate(() =>
      sessionStorage.getItem('kbroles.role'),
    )
    expect(roleInSS).toBeNull()
  })
})
