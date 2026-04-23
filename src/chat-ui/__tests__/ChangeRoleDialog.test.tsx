// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChangeRoleDialog } from '../ChangeRoleDialog'

describe('ChangeRoleDialog — Pitfall 18 Cancel default-focus + label disambiguation', () => {
  it('does not render dialog content when open=false', () => {
    render(<ChangeRoleDialog open={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders dialog with title and description when open=true', () => {
    render(<ChangeRoleDialog open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Change role?')).toBeInTheDocument()
    expect(screen.getByText(/clear this conversation/i)).toBeInTheDocument()
  })

  it('Cancel button has autoFocus (Pitfall 18 — Cancel is default-focused)', () => {
    render(<ChangeRoleDialog open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />)
    const cancelBtn = screen.getByRole('button', { name: /^cancel$/i })
    expect(cancelBtn).toHaveFocus()
  })

  it('Cancel click fires onOpenChange(false) and does NOT call onConfirm', async () => {
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ChangeRoleDialog open={true} onOpenChange={onOpenChange} onConfirm={onConfirm} />,
    )
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('ESC key dismisses dialog: onOpenChange(false) called (Radix default)', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ChangeRoleDialog open={true} onOpenChange={onOpenChange} onConfirm={vi.fn()} />,
    )
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('confirm "Change role and clear" button: calls onConfirm then onOpenChange(false)', async () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ChangeRoleDialog open={true} onOpenChange={onOpenChange} onConfirm={onConfirm} />,
    )
    // Explicit selector — CHECKER Issue 2 disambiguation
    await user.click(screen.getByRole('button', { name: /change role and clear/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('selector disambiguation regression: confirm button accessible name is exactly "Change role and clear"', () => {
    render(<ChangeRoleDialog open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'Change role and clear' }),
    ).toBeInTheDocument()
  })

  it('confirm button label is NOT "Change role" alone (prevents E2E selector collision)', () => {
    render(<ChangeRoleDialog open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />)
    // Exact-match "Change role" should NOT exist as a standalone button label
    expect(screen.queryByRole('button', { name: /^change role$/i })).not.toBeInTheDocument()
  })
})
