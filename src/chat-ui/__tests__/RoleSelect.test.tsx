// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RoleSelect } from '../RoleSelect'

describe('RoleSelect — role cards', () => {
  it('renders both role card labels', () => {
    render(<RoleSelect onPick={vi.fn()} />)
    expect(screen.getByText('Knowledge Consumer')).toBeInTheDocument()
    expect(screen.getByText('KB Author / SME')).toBeInTheDocument()
  })

  it('both cards are button elements (keyboard-focusable by default)', () => {
    render(<RoleSelect onPick={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
    // Each button has type="button"
    buttons.forEach((btn) => expect(btn).toHaveAttribute('type', 'button'))
  })

  it('clicking Knowledge Consumer card calls onPick("consumer") once', async () => {
    const onPick = vi.fn()
    const user = userEvent.setup()
    render(<RoleSelect onPick={onPick} />)
    await user.click(screen.getByText('Knowledge Consumer'))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('consumer')
  })

  it('clicking KB Author / SME card calls onPick("author") once', async () => {
    const onPick = vi.fn()
    const user = userEvent.setup()
    render(<RoleSelect onPick={onPick} />)
    await user.click(screen.getByText('KB Author / SME'))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('author')
  })

  it('Tab navigation: focus lands on first card, then second card', async () => {
    const user = userEvent.setup()
    render(<RoleSelect onPick={vi.fn()} />)
    await user.tab()
    // First focusable button in the grid
    const buttons = screen.getAllByRole('button')
    expect(document.activeElement).toBe(buttons[0])
    await user.tab()
    expect(document.activeElement).toBe(buttons[1])
  })

  it('Enter key selects — pressing Enter on first card fires onPick("consumer")', async () => {
    const onPick = vi.fn()
    const user = userEvent.setup()
    render(<RoleSelect onPick={onPick} />)
    await user.tab()
    await user.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith('consumer')
  })

  it('Space key selects — pressing Space on first card fires onPick', async () => {
    const onPick = vi.fn()
    const user = userEvent.setup()
    render(<RoleSelect onPick={onPick} />)
    await user.tab()
    await user.keyboard(' ')
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('Pitfall 16: Consumer card has SVG icon AND consumer-* colour class', () => {
    render(<RoleSelect onPick={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    const consumerCard = buttons.find((b) => b.textContent?.includes('Knowledge Consumer'))!
    // ICON present — lucide-react renders an <svg>
    expect(consumerCard.querySelector('svg')).toBeTruthy()
    // COLOUR present — button or a descendant contains a consumer-* class token
    const hasConsumerClass = consumerCard.className.includes('consumer-')
    const spanWithConsumer = consumerCard.querySelector('[class*="consumer-"]')
    expect(hasConsumerClass || spanWithConsumer).toBeTruthy()
  })

  it('Pitfall 16: Author card has SVG icon AND author-* colour class', () => {
    render(<RoleSelect onPick={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    const authorCard = buttons.find((b) => b.textContent?.includes('KB Author'))!
    // ICON present
    expect(authorCard.querySelector('svg')).toBeTruthy()
    // COLOUR present
    const hasAuthorClass = authorCard.className.includes('author-')
    const spanWithAuthor = authorCard.querySelector('[class*="author-"]')
    expect(hasAuthorClass || spanWithAuthor).toBeTruthy()
  })
})
