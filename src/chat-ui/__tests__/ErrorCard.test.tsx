// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ErrorCard } from '../ErrorCard'
import type { ErrorCode } from '../types'

describe('ErrorCard — CHAT-07 error variants + X-Request-Id surfacing', () => {
  it('renders role=alert, warning icon (svg), and correct copy for upstream_5xx', () => {
    render(<ErrorCard errorCode="upstream_5xx" requestId="abc-123" onRetry={vi.fn()} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('alert').querySelector('svg')).toBeTruthy()
    expect(
      screen.getByText(/The knowledge service is temporarily unavailable/i),
    ).toBeInTheDocument()
  })

  it('Retry button click fires onRetry once', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(<ErrorCard errorCode="upstream_5xx" requestId="abc-123" onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('Details toggle reveals Request ID, second click hides it', async () => {
    const user = userEvent.setup()
    render(<ErrorCard errorCode="upstream_5xx" requestId="abc-123" onRetry={vi.fn()} />)
    expect(screen.queryByText(/abc-123/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /details/i }))
    expect(screen.getByText(/abc-123/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /hide details/i }))
    expect(screen.queryByText(/abc-123/)).not.toBeInTheDocument()
  })

  it('rate_limited variant: title switches to "The assistant is busy." (not generic internal copy)', () => {
    render(
      <ErrorCard
        errorCode="internal"
        requestId="req-999"
        message="rate_limited:5"
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByText('The assistant is busy.')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
  })

  it('Retry button is present in rate_limited variant', () => {
    render(
      <ErrorCard
        errorCode="internal"
        requestId="req-999"
        message="rate_limited:5"
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it.each<[ErrorCode, string]>([
    ['upstream_timeout', 'The knowledge service took too long.'],
    ['upstream_5xx', 'The knowledge service is temporarily unavailable.'],
    ['schema_reject_after_retry', 'We could not format the answer.'],
    ['internal', 'Something went wrong.'],
    ['token_expired', 'Your session expired.'],
  ])('errorCode=%s renders distinct copy: %s', (errorCode, expectedText) => {
    render(<ErrorCard errorCode={errorCode} requestId="x" onRetry={vi.fn()} />)
    expect(screen.getByText(expectedText)).toBeInTheDocument()
  })

  it('X-Request-Id surfacing: requestId appears in DOM when Details is open (CONTEXT §Error card)', async () => {
    const user = userEvent.setup()
    render(<ErrorCard errorCode="internal" requestId="req-abc-123" onRetry={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /details/i }))
    expect(screen.getByText(/req-abc-123/)).toBeInTheDocument()
  })

  // ─── Phase-5 token_expired 9th ErrorCode (CONTEXT §Auth boundary) ──────────

  describe('token_expired — Phase-5 9th code', () => {
    it('renders title "Your session expired." (not the generic internal copy)', () => {
      render(<ErrorCard errorCode="token_expired" requestId="req-tok" onRetry={vi.fn()} />)
      expect(screen.getByText('Your session expired.')).toBeInTheDocument()
      expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
    })

    it('primary button label reads "Sign back in" (not "Retry")', () => {
      render(<ErrorCard errorCode="token_expired" requestId="req-tok" onRetry={vi.fn()} />)
      expect(screen.getByRole('button', { name: /sign back in/i })).toBeInTheDocument()
      // And crucially — the word "Retry" is NOT in the primary CTA for this
      // code. Using queryAllByRole + name filter keeps us strict about this.
      const retryButtons = screen.queryAllByRole('button', { name: /^retry$/i })
      expect(retryButtons).toHaveLength(0)
    })

    it('sub-copy reads "Sign back in to continue — your question was not answered."', () => {
      render(<ErrorCard errorCode="token_expired" requestId="req-tok" onRetry={vi.fn()} />)
      expect(
        screen.getByText(/sign back in to continue.+your question was not answered/i),
      ).toBeInTheDocument()
      // Standard "Your question wasn't answered." sub-copy MUST NOT appear for
      // token_expired (would leak the non-auth wording through the branch).
      expect(screen.queryByText(/your question wasn't answered/i)).not.toBeInTheDocument()
    })

    it('primary button click fires onRetry once (Plan 05-04 re-wires the call-site)', async () => {
      const onRetry = vi.fn()
      const user = userEvent.setup()
      render(<ErrorCard errorCode="token_expired" requestId="req-tok" onRetry={onRetry} />)
      await user.click(screen.getByRole('button', { name: /sign back in/i }))
      expect(onRetry).toHaveBeenCalledTimes(1)
    })
  })
})
