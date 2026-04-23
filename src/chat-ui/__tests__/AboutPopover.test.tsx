// @vitest-environment jsdom
/**
 * AboutPopover tests — Radix Popover with first-run auto-open + dismiss.
 *
 * Radix Popover uses @radix-ui/react-use-size which requires ResizeObserver.
 * jsdom does not implement it — we polyfill with a no-op class.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { AboutPopover } from '../AboutPopover'
import { __resetConfigCacheForTests } from '../useConfig'

// Note: __resetAboutSeenForTests is not exported from useAboutTooltip.
// We reset via localStorage.clear() in beforeEach.

const SEEN_KEY = 'about_tooltip_seen_v1'

// ─── ResizeObserver polyfill for jsdom ─────────────────────────────────────────
// Radix Popover's useSize hook requires ResizeObserver; jsdom doesn't implement it.
if (typeof ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Radix Popover.Portal renders into document.body; jsdom handles this.
// We wrap in a simple button trigger for all tests.

function TestHarness({ triggerLabel = 'Open About' }: { triggerLabel?: string }) {
  return (
    <AboutPopover>
      <button type="button">{triggerLabel}</button>
    </AboutPopover>
  )
}

beforeEach(() => {
  localStorage.clear()
  // Reset useConfig module cache to avoid cross-test contamination
  __resetConfigCacheForTests()
})

describe('AboutPopover', () => {
  // Test 1: First-run auto-open with empty localStorage
  it('first-run: popover auto-opens when localStorage is empty', async () => {
    render(<TestHarness />)

    // After mount effects fire, popover should be open
    await waitFor(() => {
      expect(screen.queryByText('About this assistant')).toBeInTheDocument()
    })
  })

  // Test 2: Content has three bullets
  it('popover content has three expected bullets', async () => {
    render(<TestHarness />)

    await waitFor(() =>
      expect(screen.queryByText('About this assistant')).toBeInTheDocument()
    )

    expect(screen.getByText(/What I can answer/i)).toBeInTheDocument()
    expect(screen.getByText(/What I can't/i)).toBeInTheDocument()
    expect(screen.getByText(/How to flag a gap/i)).toBeInTheDocument()
  })

  // Test 3: Got it button dismisses popover + sets localStorage
  it('"Got it" button dismisses popover and sets localStorage seen flag', async () => {
    const user = userEvent.setup()
    render(<TestHarness />)

    // Wait for auto-open
    await waitFor(() =>
      expect(screen.queryByText('About this assistant')).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /got it/i }))

    // Popover closed
    await waitFor(() =>
      expect(screen.queryByText('About this assistant')).not.toBeInTheDocument()
    )

    // localStorage set
    expect(localStorage.getItem(SEEN_KEY)).toBe('true')
  })

  // Test 4: X button (Dismiss) closes popover + sets localStorage
  it('X dismiss button closes popover and sets localStorage seen flag', async () => {
    const user = userEvent.setup()
    render(<TestHarness />)

    // Wait for auto-open
    await waitFor(() =>
      expect(screen.queryByText('About this assistant')).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /dismiss about popover/i }))

    // Popover closed
    await waitFor(() =>
      expect(screen.queryByText('About this assistant')).not.toBeInTheDocument()
    )

    // localStorage set
    expect(localStorage.getItem(SEEN_KEY)).toBe('true')
  })

  // Test 5: Repeat render after localStorage seeded → popover NOT visible on mount
  it('does NOT auto-open when localStorage already has seen flag', async () => {
    localStorage.setItem(SEEN_KEY, 'true')
    render(<TestHarness />)

    // Give effects time to fire
    await waitFor(() => {
      // Popover should NOT be visible
      expect(screen.queryByText('About this assistant')).not.toBeInTheDocument()
    })
  })

  // Test 6: Manual open via trigger button — always opens regardless of seen flag
  it('clicking the trigger button opens popover even when localStorage is seeded', async () => {
    localStorage.setItem(SEEN_KEY, 'true')
    const user = userEvent.setup()
    render(<TestHarness triggerLabel="Open About" />)

    // Confirm popover is NOT visible initially
    await waitFor(() =>
      expect(screen.queryByText('About this assistant')).not.toBeInTheDocument()
    )

    // Click the trigger button
    await user.click(screen.getByRole('button', { name: /open about/i }))

    // Popover opens
    await waitFor(() =>
      expect(screen.getByText('About this assistant')).toBeInTheDocument()
    )
  })
})
