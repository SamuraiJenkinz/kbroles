// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantControls } from '../AssistantControls'
import type { Message } from '../types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const doneMessageWithCitation: Extract<Message, { kind: 'assistant' }> = {
  kind: 'assistant',
  id: 'a1',
  state: 'done',
  text: 'Flagging an article is simple. Click the flag icon.',
  citations: [{ source_id: 'KB0022991', section_id: 'flagging-articles', quote: 'irrelevant' }],
  at: Date.now(),
}

const doneMessageNoCitation: Extract<Message, { kind: 'assistant' }> = {
  kind: 'assistant',
  id: 'a2',
  state: 'fallback',
  text: '<fallback string>',
  citations: [],
  at: Date.now(),
}

const doneMessageUnknownSection: Extract<Message, { kind: 'assistant' }> = {
  kind: 'assistant',
  id: 'a3',
  state: 'done',
  text: 'Some answer.',
  citations: [{ source_id: 'KB0022991', section_id: 'some-unrecognised-anchor', quote: 'x' }],
  at: Date.now(),
}

const messageWithDownFeedback: Extract<Message, { kind: 'assistant' }> = {
  kind: 'assistant',
  id: 'a4',
  state: 'done',
  text: 'Some answer.',
  citations: [],
  at: Date.now(),
  feedback: { kind: 'down', reason: 'hallucinated' },
}

// ─── Clipboard setup ─────────────────────────────────────────────────────────
// user-event v14 calls attachClipboardStubToView during setup(), which replaces
// navigator.clipboard on the jsdom window. We intercept it by creating our own
// spy on the clipboard object AFTER userEvent.setup() is called in each test.
// For Copy-specific tests, we use a manual click approach instead of userEvent.

function clickButton(element: HTMLElement) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('AssistantControls — copy + thumbs + feedback', () => {
  it('Copy with citation: UTIL-01 exact format "(Source: KB0022991 · Flagging Articles)"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText },
    })
    render(<AssistantControls message={doneMessageWithCitation} onFeedback={vi.fn()} />)
    clickButton(screen.getByRole('button', { name: /copy answer/i }))
    // Wait for async writeText
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText).toHaveBeenCalledWith(
      'Flagging an article is simple. Click the flag icon.\n\n(Source: KB0022991 · Flagging Articles)',
    )
  })

  it('Copy without citation (fallback case): copies body text only, no source suffix', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText },
    })
    render(<AssistantControls message={doneMessageNoCitation} onFeedback={vi.fn()} />)
    clickButton(screen.getByRole('button', { name: /copy answer/i }))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText).toHaveBeenCalledWith('<fallback string>')
  })

  it('Copy with unknown section_id falls back to section_id alone', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText },
    })
    render(<AssistantControls message={doneMessageUnknownSection} onFeedback={vi.fn()} />)
    clickButton(screen.getByRole('button', { name: /copy answer/i }))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText).toHaveBeenCalledWith(
      'Some answer.\n\n(Source: KB0022991 · some-unrecognised-anchor)',
    )
  })

  it('graceful no-throw when clipboard.writeText rejects (Pitfall 10)', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowed'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText },
    })
    render(<AssistantControls message={doneMessageWithCitation} onFeedback={vi.fn()} />)
    const copyBtn = screen.getByRole('button', { name: /copy answer/i })
    // Direct click - must not throw
    expect(() => clickButton(copyBtn)).not.toThrow()
    // writeText IS called (then silently catches the rejection)
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce())
  })

  it('thumbs-up toggle: click fires onFeedback("up")', async () => {
    const onFeedback = vi.fn()
    const user = userEvent.setup()
    render(<AssistantControls message={doneMessageNoCitation} onFeedback={onFeedback} />)
    await user.click(screen.getByRole('button', { name: 'Helpful' }))
    expect(onFeedback).toHaveBeenCalledWith('up')
  })

  it('thumbs-up toggle: clicking when feedback=up fires onFeedback(null)', async () => {
    const onFeedback = vi.fn()
    const user = userEvent.setup()
    render(
      <AssistantControls
        message={{ ...doneMessageNoCitation, feedback: 'up' }}
        onFeedback={onFeedback}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Helpful' }))
    expect(onFeedback).toHaveBeenCalledWith(null)
  })

  it('thumbs-down opens FeedbackPanel; selecting a reason calls onFeedback and closes panel', async () => {
    const onFeedback = vi.fn()
    const user = userEvent.setup()
    render(<AssistantControls message={doneMessageNoCitation} onFeedback={onFeedback} />)
    // No panel initially
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Not helpful' }))
    // Panel rendered
    expect(screen.getByRole('region', { name: /not helpful/i })).toBeInTheDocument()
    // Select 'Wrong citation'
    await user.click(screen.getByRole('radio', { name: /wrong citation/i }))
    expect(onFeedback).toHaveBeenCalledWith({ kind: 'down', reason: 'wrong_citation' })
    // Panel should close
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('thumbs-down with existing down feedback toggles off (no panel re-open)', async () => {
    const onFeedback = vi.fn()
    const user = userEvent.setup()
    render(<AssistantControls message={messageWithDownFeedback} onFeedback={onFeedback} />)
    await user.click(screen.getByRole('button', { name: 'Not helpful' }))
    expect(onFeedback).toHaveBeenCalledWith(null)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('FeedbackPanel Cancel closes the panel but does NOT dispatch onFeedback (NIT)', async () => {
    const onFeedback = vi.fn()
    const user = userEvent.setup()
    render(<AssistantControls message={doneMessageNoCitation} onFeedback={onFeedback} />)
    // Open panel
    await user.click(screen.getByRole('button', { name: 'Not helpful' }))
    expect(screen.getByRole('region', { name: /not helpful/i })).toBeInTheDocument()
    // Click Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    // Panel unmounted
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    // onFeedback was NOT called
    expect(onFeedback).not.toHaveBeenCalled()
  })

  it('thumbs-up and thumbs-down are mutually exclusive: dispatches correct payload', async () => {
    const onFeedback = vi.fn()
    const user = userEvent.setup()
    render(
      <AssistantControls
        message={{ ...doneMessageNoCitation, feedback: 'up' }}
        onFeedback={onFeedback}
      />,
    )
    // Click thumbs-down (starts panel since current feedback is 'up', not 'down')
    await user.click(screen.getByRole('button', { name: 'Not helpful' }))
    await user.click(screen.getByRole('radio', { name: /other/i }))
    expect(onFeedback).toHaveBeenCalledWith({ kind: 'down', reason: 'other' })
  })

  it('always visible: Copy, Helpful, Not helpful buttons are not hidden (CONTEXT §Thumbs)', () => {
    render(<AssistantControls message={doneMessageWithCitation} onFeedback={vi.fn()} />)
    expect(screen.getByRole('button', { name: /copy answer/i })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Helpful' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Not helpful' })).toBeVisible()
  })
})
