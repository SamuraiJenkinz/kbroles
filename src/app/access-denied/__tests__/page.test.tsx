// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AccessDeniedPage from '../page'

/**
 * /access-denied page tests — Plan 05-02 Task 1.
 *
 * Invariant (CONTEXT §Blocked-user UX): leaks NO JWT claims, tenant IDs, or
 * GUID-shaped strings. Content Steward email comes from /api/config via
 * useConfig; we mock the hook directly so render is hermetic.
 *
 * `mockConfigValue` is mutable so individual tests can flip to null/default-
 * fallback shape without reimporting the page through vi.doMock (which
 * doesn't retroactively swap already-imported ES-module references).
 */

const MOCK_CONFIG = {
  versions: { KB0022991: '13.0', KB0020882: '9.0', SNOW_FORM: '2026-04-23' },
  contentStewardEmail: 'steward@mmc.com',
}

let mockConfigValue: typeof MOCK_CONFIG | null = MOCK_CONFIG

vi.mock('@/chat-ui/useConfig', () => ({
  useConfig: () => ({ config: mockConfigValue, error: null }),
}))

beforeEach(() => {
  mockConfigValue = MOCK_CONFIG
  vi.clearAllMocks()
})

afterEach(() => {
  mockConfigValue = MOCK_CONFIG
  vi.restoreAllMocks()
})

describe('AccessDeniedPage — full-page wrong-tenant block', () => {
  it('renders the "Access restricted" heading', () => {
    render(<AccessDeniedPage />)
    expect(
      screen.getByRole('heading', { level: 1, name: /access restricted/i }),
    ).toBeInTheDocument()
  })

  it('renders the ShieldOff icon (svg) as aria-hidden', () => {
    const { container } = render(<AccessDeniedPage />)
    const svg = container.querySelector('svg[aria-hidden="true"]')
    expect(svg).toBeTruthy()
  })

  it('surfaces a mailto: link targeting contentStewardEmail from useConfig', async () => {
    render(<AccessDeniedPage />)

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /contact ctss knowledge team/i })
      expect(link).toBeInTheDocument()
      const href = link.getAttribute('href') ?? ''
      expect(href).toMatch(/^mailto:steward@mmc\.com\?/)
      // Subject + body are URL-encoded — full-word presence is the stable
      // contract; exact encoding differs by character set.
      expect(href).toContain('subject=')
      expect(href).toContain('body=')
    })
  })

  it('leak-invariant: no GUID-shaped strings, no "tenant"/"JWT"/"token" in visible copy', () => {
    const { container } = render(<AccessDeniedPage />)
    const text = container.textContent ?? ''

    // GUID shape: 8-hex-4-hex (partial Entra tid/oid prefix would match).
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)

    // Technical-detail words — the copy deliberately stays non-technical.
    expect(text).not.toMatch(/\btenant\b/i)
    expect(text).not.toMatch(/\bJWT\b/)
    // "token" is a technical auth term; deliberate absence per CONTEXT.
    expect(text).not.toMatch(/\btoken\b/i)
  })

  it('falls back to the default Content Steward mailbox when config has not loaded', () => {
    // useConfig returns {config:null} during the initial render before
    // /api/config resolves. Mutate the mock's value then re-render.
    mockConfigValue = null

    render(<AccessDeniedPage />)
    const link = screen.getByRole('link', { name: /contact ctss knowledge team/i })
    const href = link.getAttribute('href') ?? ''
    // Default fallback mailbox embedded in the page when config is null.
    expect(href).toMatch(/^mailto:kb-knowledge-team@mmc\.com\?/)
  })
})
