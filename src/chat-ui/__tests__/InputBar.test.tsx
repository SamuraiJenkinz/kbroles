// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { InputBar, type InputBarProps } from '../InputBar'

// Controlled wrapper for InputBar — maintains value state via useState
function ControlledInputBar(
  props: Omit<InputBarProps, 'value' | 'onChange'> & { initialValue?: string },
) {
  const { initialValue = '', ...rest } = props
  const [value, setValue] = useState(initialValue)
  return <InputBar {...rest} value={value} onChange={setValue} />
}

describe('InputBar — keyboard semantics + forwardRef', () => {
  it('submit button is disabled when value is empty', () => {
    render(
      <ControlledInputBar
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        placeholder="Ask…"
      />,
    )
    const btn = screen.getByRole('button', { name: /send message/i })
    expect(btn).toBeDisabled()
  })

  it('after typing, submit button is enabled and Enter submits (CHAT-05)', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <ControlledInputBar
        onSubmit={onSubmit}
        onStop={vi.fn()}
        isStreaming={false}
        placeholder="Ask…"
      />,
    )
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'hello')
    const btn = screen.getByRole('button', { name: /send message/i })
    expect(btn).not.toBeDisabled()
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('onStop is NOT called on Enter submit', async () => {
    const onSubmit = vi.fn()
    const onStop = vi.fn()
    const user = userEvent.setup()
    render(
      <ControlledInputBar
        onSubmit={onSubmit}
        onStop={onStop}
        isStreaming={false}
        placeholder="Ask…"
      />,
    )
    await user.type(screen.getByRole('textbox'), 'hello')
    await user.keyboard('{Enter}')
    expect(onStop).not.toHaveBeenCalled()
  })

  it('Shift+Enter inserts a newline and does NOT submit (CHAT-05)', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <ControlledInputBar
        onSubmit={onSubmit}
        onStop={vi.fn()}
        isStreaming={false}
        placeholder="Ask…"
      />,
    )
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    await user.type(textarea, 'first')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    await user.type(textarea, 'second')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(textarea.value).toContain('\n')
  })

  it('Enter on empty input does NOT call onSubmit (guard against empty submits)', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <ControlledInputBar
        onSubmit={onSubmit}
        onStop={vi.fn()}
        isStreaming={false}
        placeholder="Ask…"
      />,
    )
    await user.click(screen.getByRole('textbox'))
    await user.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('isStreaming swaps submit icon to Stop button (aria-label "Stop response")', () => {
    render(
      <ControlledInputBar
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        isStreaming={true}
        placeholder="Ask…"
      />,
    )
    expect(screen.getByRole('button', { name: /stop response/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument()
  })

  it('clicking Stop calls onStop', async () => {
    const onStop = vi.fn()
    const user = userEvent.setup()
    render(
      <ControlledInputBar
        onSubmit={vi.fn()}
        onStop={onStop}
        isStreaming={true}
        placeholder="Ask…"
      />,
    )
    await user.click(screen.getByRole('button', { name: /stop response/i }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('textarea stays editable while streaming (CONTEXT §In-flight state)', async () => {
    const user = userEvent.setup()
    render(
      <ControlledInputBar
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        isStreaming={true}
        placeholder="Ask…"
      />,
    )
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    await user.type(textarea, 'draft')
    expect(textarea.value).toBe('draft')
  })

  it('forwardRef exposes the textarea element and supports imperative focus (CHECKER Issue 1)', () => {
    function Wrapper() {
      const ref = useRef<HTMLTextAreaElement>(null)
      return (
        <div>
          <InputBar
            ref={ref}
            value=""
            onChange={vi.fn()}
            onSubmit={vi.fn()}
            onStop={vi.fn()}
            isStreaming={false}
            placeholder="Ask…"
          />
          <button
            type="button"
            onClick={() => ref.current?.focus()}
            data-testid="focus-trigger"
          >
            Focus
          </button>
          <output data-testid="tag">{ref.current?.tagName ?? ''}</output>
        </div>
      )
    }

    const { getByTestId } = render(<Wrapper />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    // ref.current should be the textarea
    expect(textarea.tagName).toBe('TEXTAREA')
    // Programmatic focus via ref
    textarea.focus()
    expect(document.activeElement).toBe(textarea)
  })
})
