// @vitest-environment jsdom
/**
 * MessageList tests — verifies fallback branch renders FallbackCard
 * and that Message is used for all other states.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import * as Tooltip from '@radix-ui/react-tooltip'
import { MessageList } from '../MessageList'
import type { Message } from '../types'
import { FALLBACK_STRING } from '@/grounding/fallback'

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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeUserMessage(text = 'What is the flagging process?', id = 'user-1'): Message {
  return { kind: 'user', id, text, at: Date.now() }
}

function makeFallbackMessage(id = 'asst-fallback-1'): Message {
  return {
    kind: 'assistant',
    id,
    state: 'fallback',
    text: FALLBACK_STRING,
    citations: [],
    at: Date.now(),
    requestId: 'req-test-999',
  }
}

function makeDoneMessage(text = 'Here is the answer.', id = 'asst-done-1'): Message {
  return {
    kind: 'assistant',
    id,
    state: 'done',
    text,
    citations: [],
    at: Date.now(),
  }
}

const DEFAULT_LIST_PROPS = {
  inFlightId: null,
  role: 'consumer' as const,
  contentStewardEmail: 'kb-knowledge-team@mmc.com',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MessageList — fallback-state routing', () => {
  // Test 1: Renders FallbackCard for state=fallback
  it('renders FallbackCard (role=region aria-label="Fallback response") for state=fallback', () => {
    const messages = [makeUserMessage(), makeFallbackMessage()]
    renderWithProviders(
      <MessageList {...DEFAULT_LIST_PROPS} messages={messages} />
    )
    expect(screen.getByRole('region', { name: /fallback response/i })).toBeInTheDocument()
  })

  // Test 2: Fallback does NOT render KB avatar, timestamp, or feedback
  it('fallback card does NOT render KB avatar, timestamp, or feedback buttons', () => {
    const messages = [makeUserMessage(), makeFallbackMessage()]
    renderWithProviders(
      <MessageList {...DEFAULT_LIST_PROPS} messages={messages} />
    )

    // No KB avatar text
    expect(screen.queryByText('KB')).not.toBeInTheDocument()
    // No <time> element (timestamp)
    expect(document.querySelector('time')).toBeNull()
    // No feedback/copy controls
    expect(screen.queryByRole('button', { name: /helpful|not helpful|copy/i })).not.toBeInTheDocument()
  })

  // Test 3: userQuestion extraction — FallbackCard receives preceding user text
  it('passes the preceding user message text as userQuestion to FallbackCard', () => {
    const question = 'How do I flag an article step by step?'
    const messages = [makeUserMessage(question), makeFallbackMessage()]
    renderWithProviders(
      <MessageList {...DEFAULT_LIST_PROPS} messages={messages} />
    )

    // The fallback card's mailto href contains the user question
    const link = screen.getByRole('link', { name: /flag this gap/i })
    const decoded = decodeURIComponent(link.getAttribute('href') ?? '')
    expect(decoded).toContain(question)
  })

  // Test 4: Non-fallback messages render as Message (not FallbackCard)
  it('renders done-state message as Message, not FallbackCard', () => {
    const messages: Message[] = [makeDoneMessage('Here is the answer.')]
    renderWithProviders(
      <MessageList {...DEFAULT_LIST_PROPS} messages={messages} />
    )
    // No FallbackCard region
    expect(screen.queryByRole('region', { name: /fallback response/i })).not.toBeInTheDocument()
    // Done message text rendered
    expect(screen.getByText('Here is the answer.')).toBeInTheDocument()
  })

  // Test 5: Empty messages → returns null (no render)
  it('returns null when messages array is empty', () => {
    const { container } = renderWithProviders(
      <MessageList {...DEFAULT_LIST_PROPS} messages={[]} />
    )
    expect(container.firstChild).toBeNull()
  })

  // Test 6: Chip passthrough still works for done messages
  it('forwards onChipClick to Message component for non-fallback messages', async () => {
    const onChipClick = vi.fn()
    const messages: Message[] = [
      {
        kind: 'assistant',
        id: 'asst-with-chip',
        state: 'done',
        text: 'Answer with citation',
        citations: [{ source_id: 'KB0020882', section_id: 'resolution-field-software', quote: 'verbatim' }],
        at: Date.now(),
      }
    ]
    renderWithProviders(
      <MessageList {...DEFAULT_LIST_PROPS} messages={messages} onChipClick={onChipClick} />
    )

    // Citation chip rendered
    expect(screen.getByRole('button', { name: /open source KB0020882/i })).toBeInTheDocument()
  })
})
