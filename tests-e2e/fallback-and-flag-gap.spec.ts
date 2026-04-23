import { test, expect } from '@playwright/test'
import { mockPrompts, mockConfig, mockSources, mockChatFallbackPage } from './fixtures/mockChat'

const FALLBACK_TEXT =
  "That information isn't in the loaded documents yet. Flag the gap to the CTSS Knowledge team via KB0022991."

test('SC #4 — Fallback card renders with three-signal distinct treatment + Flag button opens mailto', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear()
    localStorage.setItem('about_tooltip_seen_v1', 'true')
  })
  await mockPrompts(page)
  await mockConfig(page)
  await mockSources(page)
  await mockChatFallbackPage(page, { text: FALLBACK_TEXT, requestId: 'req-test-abc' })

  await page.goto('/')
  await page.getByRole('button', { name: /Knowledge Consumer/i }).click()
  await page.getByRole('textbox').fill('What is the capital of France?')
  await page.keyboard.press('Enter')

  // Fallback region present
  const fallback = page.getByRole('region', { name: /Fallback response/i })
  await expect(fallback).toBeVisible()

  // Exact §15 copy (verbatim from server)
  await expect(fallback).toContainText(FALLBACK_TEXT)

  // Pitfall 20 three-signal invariant: border + bg + icon+bold-heading simultaneously
  //   Signal 1 — amber border class
  await expect(fallback).toHaveClass(/border-amber-400/)
  //   Signal 2 — amber background class
  await expect(fallback).toHaveClass(/bg-amber-50/)
  //   Signal 3a — CircleOff icon SVG present
  await expect(fallback.locator('svg').first()).toBeVisible()
  //   Signal 3b — bold heading present (h3 with font-bold)
  await expect(fallback.getByRole('heading', { level: 3 })).toHaveClass(/font-bold/)

  // Pitfall 20 — NO Message-like affordances
  // No KB avatar text (normal messages show "KB" in a span with avatar styling)
  await expect(fallback.getByText(/^KB$/)).toHaveCount(0)
  // No timestamp element
  await expect(fallback.locator('time')).toHaveCount(0)
  // No feedback thumbs buttons
  await expect(fallback.getByRole('button', { name: /helpful/i })).toHaveCount(0)
  // No copy button
  await expect(fallback.getByRole('button', { name: /copy answer/i })).toHaveCount(0)

  // Flag link present — Plan 03 renders `<a href={mailtoHref}>` (NOT a button
  // with imperative window.location assignment). The href is part of the DOM,
  // so Playwright can assert it directly via toHaveAttribute — no
  // window.location monkeypatching needed (which is unreliable in Chromium
  // because window.location is non-configurable in real browsers).
  // FallbackCard aria-label: "Flag this gap to the CTSS Knowledge team"
  const flagLink = fallback.getByRole('link', { name: /Flag this gap/i })
  await expect(flagLink).toBeVisible()

  // Assert href is a mailto URL encoding all four body fields + CRLF separators.
  await expect(flagLink).toHaveAttribute('href', /^mailto:kb-knowledge-team@mmc\.com/)
  const mailtoHref = await flagLink.getAttribute('href')
  expect(mailtoHref).toBeTruthy()
  const decoded = decodeURIComponent(mailtoHref!)
  expect(decoded).toContain('What is the capital of France?')
  expect(decoded).toContain('Role: consumer')
  expect(decoded).toContain('Request ID: req-test-abc')
  // CRLF line separators (decodeURIComponent restores %0D%0A to \r\n)
  expect(decoded).toContain('\r\n')
  // Subject contains role
  expect(decoded).toMatch(/subject=KB Assistant: unanswered question \(role: consumer\)/)

  // Click fires the default browser mailto handler. To avoid Playwright
  // navigating to the mailto URL (which would error), attach a listener that
  // cancels the default mailto navigation while still letting the component's
  // onClick handler fire to swap the label.
  await page.evaluate(() => {
    document.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement
        const a = target.closest('a[href^="mailto:"]')
        if (a) e.preventDefault()
      },
      true,
    )
  })
  await flagLink.click()

  // Label swapped to "Opened in mail client" (still a link, not a button).
  // The FallbackCard changes the text content inside the <a> but the aria-label
  // attribute stays "Flag this gap to the CTSS Knowledge team". Use text content
  // matching to assert the visual change.
  const updatedLink = fallback.locator('a', { hasText: /Opened in mail client/i })
  await expect(updatedLink).toBeVisible()
  // Href remains valid after click (still assertable)
  await expect(updatedLink).toHaveAttribute('href', /^mailto:/)
})
