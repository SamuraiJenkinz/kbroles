// @vitest-environment jsdom
/**
 * FallbackCard tests — proves Pitfall 20 (three visual signals) and
 * Pitfall 16 (icon+colour pairing) are enforced via assertions.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { FallbackCard } from '../FallbackCard'
import type { Message } from '../types'
import { FALLBACK_STRING } from '@/grounding/fallback'

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeFallbackMessage(overrides?: Partial<Extract<Message, { kind: 'assistant' }>>): Extract<Message, { kind: 'assistant' }> {
  return {
    kind: 'assistant',
    id: 'asst-fallback-1',
    state: 'fallback',
    text: FALLBACK_STRING,
    citations: [],
    at: Date.now(),
    requestId: 'req-test-123',
    ...overrides,
  }
}

const DEFAULT_PROPS = {
  message: makeFallbackMessage(),
  role: 'consumer' as const,
  contentStewardEmail: 'kb-knowledge-team@mmc.com',
  userQuestion: 'What is the capital of France?',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FallbackCard — Pitfall 20 three visual signals simultaneously', () => {
  it('Signal 1: container has border-amber-400 class (amber border)', () => {
    render(<FallbackCard {...DEFAULT_PROPS} />)
    const region = screen.getByRole('region', { name: /fallback response/i })
    expect(region.className).toContain('border-amber-400')
  })

  it('Signal 2: container has bg-amber-50 class (amber-tinted background)', () => {
    render(<FallbackCard {...DEFAULT_PROPS} />)
    const region = screen.getByRole('region', { name: /fallback response/i })
    expect(region.className).toContain('bg-amber-50')
  })

  it('Signal 3a: CircleOff SVG icon is present', () => {
    const { container } = render(<FallbackCard {...DEFAULT_PROPS} />)
    // CircleOff renders as an <svg>
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })

  it('Signal 3b: heading has font-bold class (typographic weight)', () => {
    render(<FallbackCard {...DEFAULT_PROPS} />)
    const heading = screen.getByRole('heading', { name: /outside my knowledge/i })
    expect(heading.className).toContain('font-bold')
  })
})

describe('FallbackCard — Pitfall 16 icon+colour pairing', () => {
  it('every amber element in the card is accompanied by an SVG icon', () => {
    const { container } = render(<FallbackCard {...DEFAULT_PROPS} />)
    // The outer region has amber classes — it contains an SVG
    const region = screen.getByRole('region', { name: /fallback response/i })
    expect(region.querySelector('svg')).not.toBeNull()
    // The amber heading text has a sibling SVG in the flex container
    const flexContainer = container.querySelector('.flex.items-start.gap-2')
    expect(flexContainer?.querySelector('svg')).not.toBeNull()
  })
})

describe('FallbackCard — verbatim fallback text', () => {
  it('renders the exact FALLBACK_STRING from @/grounding/fallback', () => {
    render(<FallbackCard {...DEFAULT_PROPS} />)
    // The <p> contains the exact verbatim server text
    const p = screen.getByText(FALLBACK_STRING)
    expect(p).toBeInTheDocument()
    expect(p.tagName.toLowerCase()).toBe('p')
  })
})

describe('FallbackCard — NOT styled like Message (no message affordances)', () => {
  it('does NOT render KB avatar text', () => {
    render(<FallbackCard {...DEFAULT_PROPS} />)
    expect(screen.queryByText('KB')).not.toBeInTheDocument()
  })

  it('does NOT render a <time> element', () => {
    const { container } = render(<FallbackCard {...DEFAULT_PROPS} />)
    expect(container.querySelector('time')).toBeNull()
  })

  it('does NOT render feedback thumbs or copy answer controls', () => {
    render(<FallbackCard {...DEFAULT_PROPS} />)
    // No buttons with helpful/not helpful/copy names
    expect(screen.queryByRole('button', { name: /helpful|not helpful|copy/i })).not.toBeInTheDocument()
  })
})

describe('FallbackCard — Flag this gap link', () => {
  it('renders as an <a> (role=link), not a button', () => {
    render(<FallbackCard {...DEFAULT_PROPS} />)
    const link = screen.getByRole('link', { name: /flag this gap/i })
    expect(link).toBeInTheDocument()
    expect(link.tagName.toLowerCase()).toBe('a')
  })

  it('has bg-amber-600 and text-white classes (primary-action styling)', () => {
    render(<FallbackCard {...DEFAULT_PROPS} />)
    const link = screen.getByRole('link', { name: /flag this gap/i })
    expect(link.className).toContain('bg-amber-600')
    expect(link.className).toContain('text-white')
  })

  it('href is a mailto: URL', () => {
    render(<FallbackCard {...DEFAULT_PROPS} />)
    const link = screen.getByRole('link', { name: /flag this gap/i })
    expect(link).toHaveAttribute('href', expect.stringMatching(/^mailto:/))
  })

  it('decoded href contains the user question and role', () => {
    render(<FallbackCard {...DEFAULT_PROPS} />)
    const link = screen.getByRole('link', { name: /flag this gap/i })
    const href = link.getAttribute('href') ?? ''
    const decoded = decodeURIComponent(href)
    expect(decoded).toContain('What is the capital of France?')
    expect(decoded).toContain('Role: consumer')
  })

  it('after click: visible label swaps to "Opened in mail client", link remains (href preserved)', async () => {
    const user = userEvent.setup()
    render(<FallbackCard {...DEFAULT_PROPS} />)

    const link = screen.getByRole('link', { name: /flag this gap/i })
    await user.click(link)

    // The link is still present (same aria-label, different visible text)
    // The link element persists (not disabled/removed)
    expect(link).toBeInTheDocument()
    // href still points to mailto:
    expect(link).toHaveAttribute('href', expect.stringMatching(/^mailto:/))
    // The visible text content changed to the success label
    expect(link.textContent).toMatch(/opened in mail client/i)
  })
})

describe('FallbackCard — accessibility', () => {
  it('outer container has role="region" + aria-label="Fallback response"', () => {
    render(<FallbackCard {...DEFAULT_PROPS} />)
    expect(screen.getByRole('region', { name: /fallback response/i })).toBeInTheDocument()
  })

  it('flag link has aria-label containing "Flag this gap"', () => {
    render(<FallbackCard {...DEFAULT_PROPS} />)
    const link = screen.getByRole('link', { name: /flag this gap/i })
    expect(link.getAttribute('aria-label')).toMatch(/flag this gap/i)
  })
})

describe('FallbackCard — requestId plumbing in mailto href', () => {
  it('encoded href contains the requestId from the message', () => {
    const message = makeFallbackMessage({ requestId: 'req-abc-456' })
    render(<FallbackCard {...DEFAULT_PROPS} message={message} />)
    const link = screen.getByRole('link', { name: /flag this gap/i })
    const href = link.getAttribute('href') ?? ''
    const decoded = decodeURIComponent(href)
    expect(decoded).toContain('Request ID: req-abc-456')
  })

  it('falls back to "unknown" requestId when message has no requestId', () => {
    const message = makeFallbackMessage({ requestId: undefined })
    render(<FallbackCard {...DEFAULT_PROPS} message={message} />)
    const link = screen.getByRole('link', { name: /flag this gap/i })
    const href = link.getAttribute('href') ?? ''
    const decoded = decodeURIComponent(href)
    expect(decoded).toContain('Request ID: unknown')
  })
})
