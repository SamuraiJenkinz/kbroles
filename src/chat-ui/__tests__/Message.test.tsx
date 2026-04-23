// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Message } from '../Message'
import type { Message as MessageType } from '../types'

// ─── Providers wrapper ────────────────────────────────────────────────────────

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
      {children}
    </Tooltip.Provider>
  )
}

function renderWithProviders(ui: React.ReactElement) {
  return render(ui, { wrapper: Providers })
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

import type { Citation } from '../types'

function makeAssistantMessage(overrides: Partial<{
  citations: Citation[]
  state: 'done' | 'streaming' | 'fallback'
}>): MessageType {
  return {
    kind: 'assistant',
    id: 'asst-1',
    state: overrides.state ?? 'done',
    text: 'Here is the answer.',
    citations: overrides.citations ?? [],
    at: Date.now(),
  }
}

const citationBlue = {
  source_id: 'KB0020882' as const,
  section_id: 'resolution-field-software',
  quote: 'verbatim excerpt',
}

const citationRed = {
  source_id: 'KB0022991' as const,
  section_id: 'flagging-articles',
  quote: 'another excerpt',
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Message — citation chip upgrades (Phase 4)', () => {

  // Test 1: Citation chip is a <button> NOT a <span>
  it('citation chip renders as a <button> (role=button), NOT a <span>', () => {
    const message = makeAssistantMessage({ citations: [citationBlue] })
    renderWithProviders(
      <Message message={message} onChipClick={vi.fn()} />
    )

    const btn = screen.getByRole('button', { name: /open source KB0020882/i })
    expect(btn).toBeInTheDocument()
    expect(btn.tagName.toLowerCase()).toBe('button')
  })

  // Test 2: Blue badge (KB0020882/resolution-field-software) — bg-blue-50 + SVG
  it('chip for KB0020882/resolution-field-software has bg-blue-50 class AND contains SVG (Pitfall 16)', () => {
    const message = makeAssistantMessage({ citations: [citationBlue] })
    renderWithProviders(
      <Message message={message} onChipClick={vi.fn()} />
    )

    const btn = screen.getByRole('button', { name: /open source KB0020882/i })
    expect(btn.className).toContain('bg-blue-50')
    expect(btn.querySelector('svg')).not.toBeNull()
  })

  // Test 3: Red badge (KB0022991/flagging-articles) — bg-red-50
  it('chip for KB0022991/flagging-articles has bg-red-50 class', () => {
    const message = makeAssistantMessage({ citations: [citationRed] })
    renderWithProviders(
      <Message message={message} onChipClick={vi.fn()} />
    )

    const btn = screen.getByRole('button', { name: /open source KB0022991/i })
    expect(btn.className).toContain('bg-red-50')
    expect(btn.querySelector('svg')).not.toBeNull()
  })

  // Test 4: onChipClick called with (source_id, section_id) on chip click
  it('clicking chip calls onChipClick with source_id and section_id', async () => {
    const onChipClick = vi.fn()
    const message = makeAssistantMessage({ citations: [citationBlue] })
    const user = userEvent.setup()

    renderWithProviders(
      <Message message={message} onChipClick={onChipClick} />
    )

    await user.click(screen.getByRole('button', { name: /open source KB0020882/i }))

    expect(onChipClick).toHaveBeenCalledTimes(1)
    expect(onChipClick).toHaveBeenCalledWith('KB0020882', 'resolution-field-software')
  })

  // Test 5: Active chip (matches activeSource) has ring-2 class
  it('active chip (matches activeSource) has ring-2 class; inactive chip does not', () => {
    const message = makeAssistantMessage({ citations: [citationBlue, citationRed] })
    renderWithProviders(
      <Message
        message={message}
        onChipClick={vi.fn()}
        activeSource={{ source_id: 'KB0020882', section_id: 'resolution-field-software' }}
      />
    )

    const activeBtn = screen.getByRole('button', { name: /open source KB0020882/i })
    const inactiveBtn = screen.getByRole('button', { name: /open source KB0022991/i })

    expect(activeBtn.className).toContain('ring-2')
    expect(inactiveBtn.className).not.toContain('ring-2')
  })

  // Test 6: aria-label contains human-readable badge label
  it('chip aria-label contains the human-readable badge label (not just KB id)', () => {
    const message = makeAssistantMessage({ citations: [citationBlue] })
    renderWithProviders(
      <Message message={message} onChipClick={vi.fn()} />
    )

    const btn = screen.getByRole('button', { name: /open source KB0020882/i })
    // The aria-label includes the badge label text, not just the KB ID
    expect(btn.getAttribute('aria-label')).toContain('KB0020882')
    // The label should also describe the section (from badge.label)
    expect(btn.getAttribute('aria-label')).toMatch(/resolution field|software/i)
  })

  // Test 7: No activeSource — no ring on any chip
  it('no activeSource — no ring-2 on any chip', () => {
    const message = makeAssistantMessage({ citations: [citationBlue, citationRed] })
    renderWithProviders(
      <Message message={message} onChipClick={vi.fn()} activeSource={null} />
    )

    const buttons = screen.getAllByRole('button')
    // Filter to citation chip buttons (they have bg-*-50 class)
    const chipButtons = buttons.filter(b => b.className.includes('bg-blue-50') || b.className.includes('bg-red-50'))
    chipButtons.forEach(btn => {
      expect(btn.className).not.toContain('ring-2')
    })
  })

  // Test 8: No citations — no chip buttons rendered
  it('message with no citations renders no chip buttons', () => {
    const message = makeAssistantMessage({ citations: [] })
    renderWithProviders(
      <Message message={message} onChipClick={vi.fn()} />
    )

    // No chip buttons
    const chipButtons = screen.queryAllByRole('button', { name: /open source/i })
    expect(chipButtons).toHaveLength(0)
  })

  // Test 9: onChipClick is optional — missing handler doesn't crash
  it('missing onChipClick does not crash on chip click', async () => {
    const message = makeAssistantMessage({ citations: [citationBlue] })
    const user = userEvent.setup()

    renderWithProviders(<Message message={message} />)

    const btn = screen.getByRole('button', { name: /open source KB0020882/i })
    // Should not throw
    await expect(user.click(btn)).resolves.toBeUndefined()
  })

})
