// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Header } from '../Header'

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
