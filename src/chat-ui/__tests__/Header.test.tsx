// @vitest-environment jsdom
/**
 * Header tests — includes freshness line + About popover (Plan 04-03).
 *
 * Radix Popover (used by AboutPopover) requires ResizeObserver — polyfilled below.
 * FreshnessLine calls useConfig which calls fetch('/api/config') — stubbed in all tests.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { Header } from '../Header'
import { __resetConfigCacheForTests } from '../useConfig'

const SEEN_KEY = 'about_tooltip_seen_v1'

const MOCK_CONFIG = {
  versions: { KB0022991: '13.0', KB0020882: '9.0', SNOW_FORM: '2026-04-23' },
  contentStewardEmail: 'kb-knowledge-team@mmc.com',
}

// ─── ResizeObserver polyfill (Radix Popover requires it; jsdom lacks it) ────────
if (typeof ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

function setupFetchWithConfig() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/config')) {
        return Promise.resolve(
          new Response(JSON.stringify(MOCK_CONFIG), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }),
  )
}

// For tests that don't need config data: stub fetch to return a never-resolving
// promise so useConfig doesn't crash (undefined fetch) but also doesn't pollute state.
function setupFetchNoop() {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
}

beforeEach(() => {
  localStorage.clear()
  __resetConfigCacheForTests()
  vi.restoreAllMocks()
  // Ensure fetch is always defined (Header renders FreshnessLine which calls useConfig)
  setupFetchNoop()
})

afterEach(() => {
  localStorage.clear()
  __resetConfigCacheForTests()
  vi.restoreAllMocks()
})

describe('Header — Pitfall 16 icon+colour pairing on role pill', () => {
  it('consumer pill renders an svg icon AND a consumer-specific colour class', () => {
    render(<Header role="consumer" onChangeRole={vi.fn()} onNewConversation={vi.fn()} />)
    const pill = screen.getByRole('button', { name: /Knowledge Consumer/i })
    // ICON present — lucide-react renders an <svg>
    expect(pill.querySelector('svg')).toBeTruthy()
    // COLOUR class present — pill className contains a consumer-* token
    expect(pill.className).toMatch(/consumer-/)
  })

  it('author pill renders an svg icon AND an author-specific colour class', () => {
    render(<Header role="author" onChangeRole={vi.fn()} onNewConversation={vi.fn()} />)
    const pill = screen.getByRole('button', { name: /KB Author/i })
    expect(pill.querySelector('svg')).toBeTruthy()
    expect(pill.className).toMatch(/author-/)
  })

  it('popover "Change role" option invokes onChangeRole', async () => {
    const onChangeRole = vi.fn()
    const user = userEvent.setup()
    render(<Header role="consumer" onChangeRole={onChangeRole} onNewConversation={vi.fn()} />)
    // Open the pill popover
    await user.click(screen.getByRole('button', { name: /Knowledge Consumer/i }))
    // Click "Change role" inside the popover
    await user.click(await screen.findByRole('button', { name: /^change role$/i }))
    expect(onChangeRole).toHaveBeenCalledTimes(1)
  })

  it('New conversation button invokes onNewConversation', async () => {
    const onNewConversation = vi.fn()
    const user = userEvent.setup()
    render(<Header role="consumer" onChangeRole={vi.fn()} onNewConversation={onNewConversation} />)
    await user.click(screen.getByRole('button', { name: /new conversation/i }))
    expect(onNewConversation).toHaveBeenCalledTimes(1)
  })
})

describe('Header — freshness line (Plan 04-03 SC#5)', () => {
  it('freshness span renders exact SC#5 format after /api/config resolves', async () => {
    setupFetchWithConfig()
    render(<Header role="consumer" onChangeRole={vi.fn()} onNewConversation={vi.fn()} />)

    await waitFor(() => {
      expect(
        screen.getByText(
          'Grounded in KB0022991 v13.0 · KB0020882 v9.0 · Form schema 2026-04-23',
        ),
      ).toBeInTheDocument()
    })
  })

  it('ℹ button is present with aria-label "About this assistant"', () => {
    render(<Header role="consumer" onChangeRole={vi.fn()} onNewConversation={vi.fn()} />)
    expect(screen.getByRole('button', { name: /about this assistant/i })).toBeInTheDocument()
  })
})

describe('Header — About popover (Plan 04-03)', () => {
  it('first-run: About popover auto-opens with three bullets when localStorage is empty', async () => {
    // localStorage is empty (cleared in beforeEach)
    render(<Header role="consumer" onChangeRole={vi.fn()} onNewConversation={vi.fn()} />)

    await waitFor(() => {
      expect(screen.queryByText('About this assistant')).toBeInTheDocument()
    })

    // Three bullets present
    expect(screen.getByText(/What I can answer/i)).toBeInTheDocument()
    expect(screen.getByText(/How to flag a gap/i)).toBeInTheDocument()
  })

  it('clicking ℹ re-opens popover after it was dismissed', async () => {
    const user = userEvent.setup()
    render(<Header role="consumer" onChangeRole={vi.fn()} onNewConversation={vi.fn()} />)

    // Wait for first-run auto-open
    await waitFor(() =>
      expect(screen.queryByText('About this assistant')).toBeInTheDocument()
    )

    // Dismiss via Got it
    await user.click(screen.getByRole('button', { name: /got it/i }))
    await waitFor(() =>
      expect(screen.queryByText('About this assistant')).not.toBeInTheDocument()
    )

    // Click ℹ to re-open
    await user.click(screen.getByRole('button', { name: /about this assistant/i }))
    await waitFor(() =>
      expect(screen.getByText('About this assistant')).toBeInTheDocument()
    )
  })
})
