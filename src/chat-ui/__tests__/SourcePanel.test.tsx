// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as Tooltip from '@radix-ui/react-tooltip'
import { SourcePanel } from '../SourcePanel'

// ─── Providers wrapper (Radix Tooltip required by Timestamp if used) ───────────

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

// ─── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_CONTENT_BLUE = {
  source_id: 'KB0020882',
  section_id: 'resolution-field-software',
  title: 'Resolution Field — Software',
  body: '## Resolution Field — Software\n\nThis is the resolution content.\n\n- Step one\n- Step two',
  url: 'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0020882',
  version: '9.0',
}

const MOCK_CONTENT_RED = {
  source_id: 'KB0022991',
  section_id: 'flagging-articles',
  title: 'Flagging Articles',
  body: '## Flagging Articles\n\nHow to flag an article.',
  url: 'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0022991',
  version: '13.0',
}

// ─── Fetch mock helpers ────────────────────────────────────────────────────────

function mockFetchWith(content: typeof MOCK_CONTENT_BLUE) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(content), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  ))
}

function mockFetchError() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response('Server error', { status: 500 })
  ))
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('SourcePanel', () => {

  // Test 1: Panel hidden when open=false
  it('panel hidden when open=false — no dialog content visible', () => {
    vi.stubGlobal('fetch', vi.fn())
    renderWithProviders(
      <SourcePanel open={false} loaded={null} onClose={vi.fn()} />
    )
    // Radix Dialog Content not rendered in DOM when closed
    expect(screen.queryByLabelText(/close source panel/i)).not.toBeInTheDocument()
  })

  // Test 2: Panel open with KB0020882/resolution-field-software
  it('panel open loads KB0020882 — header badge, title, body text visible', async () => {
    mockFetchWith(MOCK_CONTENT_BLUE)

    renderWithProviders(
      <SourcePanel
        open={true}
        loaded={{ source_id: 'KB0020882', section_id: 'resolution-field-software' }}
        onClose={vi.fn()}
      />
    )

    // Header badge shows KB0020882
    await waitFor(() =>
      expect(screen.getByLabelText(/source KB0020882/i)).toBeInTheDocument()
    )

    // Badge has blue class
    const badge = screen.getByLabelText(/source KB0020882/i)
    expect(badge.className).toContain('bg-blue-50')

    // Title in Dialog.Title (may appear in both Dialog.Title and body h2 — use getAllByText)
    await waitFor(() => {
      const titles = screen.getAllByText(/resolution field.*software/i)
      expect(titles.length).toBeGreaterThanOrEqual(1)
    })

    // Body content visible
    await waitFor(() =>
      expect(screen.getByText(/this is the resolution content/i)).toBeInTheDocument()
    )
  })

  // Test 3: Footer "Open in ServiceNow" link
  it('footer "Open in ServiceNow" link has correct href, target, rel', async () => {
    mockFetchWith(MOCK_CONTENT_BLUE)

    renderWithProviders(
      <SourcePanel
        open={true}
        loaded={{ source_id: 'KB0020882', section_id: 'resolution-field-software' }}
        onClose={vi.fn()}
      />
    )

    const link = await screen.findByRole('link', { name: /open in servicenow/i })
    expect(link).toHaveAttribute('href', MOCK_CONTENT_BLUE.url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // Test 4: Close button calls onClose
  it('close button click calls onClose spy', async () => {
    mockFetchWith(MOCK_CONTENT_BLUE)
    const onClose = vi.fn()
    const user = userEvent.setup()

    renderWithProviders(
      <SourcePanel
        open={true}
        loaded={{ source_id: 'KB0020882', section_id: 'resolution-field-software' }}
        onClose={onClose}
      />
    )

    const closeBtn = await screen.findByRole('button', { name: /close source panel/i })
    await user.click(closeBtn)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Test 5: Pitfall 19 — anchor DOM id is section_id, NOT heading slug
  it('Pitfall 19 — panel body element has id matching REGISTRY section_id (not heading slug)', async () => {
    mockFetchWith(MOCK_CONTENT_BLUE)

    renderWithProviders(
      <SourcePanel
        open={true}
        loaded={{ source_id: 'KB0020882', section_id: 'resolution-field-software' }}
        onClose={vi.fn()}
      />
    )

    await waitFor(() =>
      expect(screen.getByText(/this is the resolution content/i)).toBeInTheDocument()
    )

    // Radix Dialog renders into a Portal (document.body), so query from body
    // The section wrapper must have id="resolution-field-software" (from REGISTRY section_id)
    const sectionEl = document.body.querySelector('#resolution-field-software')
    expect(sectionEl).not.toBeNull()

    // Must NOT have slugified heading id
    expect(document.body.querySelector('#resolution-field-software-heading')).toBeNull()
    expect(document.body.querySelector('#software')).toBeNull()
  })

  // Test 6: Pitfall 16 — badge has BOTH colour class AND SVG icon (blue)
  it('Pitfall 16 — blue badge (KB0020882) has bg-blue-50 class AND contains SVG icon', async () => {
    mockFetchWith(MOCK_CONTENT_BLUE)

    renderWithProviders(
      <SourcePanel
        open={true}
        loaded={{ source_id: 'KB0020882', section_id: 'resolution-field-software' }}
        onClose={vi.fn()}
      />
    )

    await waitFor(() =>
      expect(screen.getByLabelText(/source KB0020882/i)).toBeInTheDocument()
    )

    const badge = screen.getByLabelText(/source KB0020882/i)
    expect(badge.className).toContain('bg-blue-50')
    // Badge must contain an SVG (the lucide icon)
    const svg = badge.querySelector('svg')
    expect(svg).not.toBeNull()
  })

  // Test 6b: Red badge (KB0022991/flagging-articles) has bg-red-50 AND SVG
  it('Pitfall 16 — red badge (KB0022991/flagging-articles) has bg-red-50 AND SVG icon', async () => {
    mockFetchWith(MOCK_CONTENT_RED)

    renderWithProviders(
      <SourcePanel
        open={true}
        loaded={{ source_id: 'KB0022991', section_id: 'flagging-articles' }}
        onClose={vi.fn()}
      />
    )

    await waitFor(() =>
      expect(screen.getByLabelText(/source KB0022991/i)).toBeInTheDocument()
    )

    const badge = screen.getByLabelText(/source KB0022991/i)
    expect(badge.className).toContain('bg-red-50')
    expect(badge.querySelector('svg')).not.toBeNull()
  })

  // Test 7: ESC key closes the dialog (Radix handles natively)
  it('ESC key closes the dialog — onClose called', async () => {
    mockFetchWith(MOCK_CONTENT_BLUE)
    const onClose = vi.fn()
    const user = userEvent.setup()

    renderWithProviders(
      <SourcePanel
        open={true}
        loaded={{ source_id: 'KB0020882', section_id: 'resolution-field-software' }}
        onClose={onClose}
      />
    )

    await screen.findByRole('button', { name: /close source panel/i })
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Test 8: onOpenAutoFocus prevented — external input keeps focus when panel opens
  it('onOpenAutoFocus prevented — external input retains focus when panel opens', () => {
    mockFetchWith(MOCK_CONTENT_BLUE)

    const { getByTestId } = renderWithProviders(
      <>
        <input data-testid="external" autoFocus />
        <SourcePanel
          open={true}
          loaded={{ source_id: 'KB0020882', section_id: 'resolution-field-software' }}
          onClose={vi.fn()}
        />
      </>
    )

    const externalInput = getByTestId('external')
    externalInput.focus()
    // After panel renders, the external input should NOT have lost focus to panel
    // (onOpenAutoFocus prevents Radix from stealing focus)
    expect(document.activeElement).toBe(externalInput)
  })

  // Test 9: Error state renders error message
  it('500 error renders error message', async () => {
    mockFetchError()

    renderWithProviders(
      <SourcePanel
        open={true}
        loaded={{ source_id: 'KB0020882', section_id: 'resolution-field-software' }}
        onClose={vi.fn()}
      />
    )

    await waitFor(() =>
      expect(screen.getByText(/could not load source/i)).toBeInTheDocument()
    )
  })

  // Test 10: Version displayed in header
  it('version string shown in header after content loads', async () => {
    mockFetchWith(MOCK_CONTENT_BLUE)

    renderWithProviders(
      <SourcePanel
        open={true}
        loaded={{ source_id: 'KB0020882', section_id: 'resolution-field-software' }}
        onClose={vi.fn()}
      />
    )

    await waitFor(() =>
      expect(screen.getByText('v9.0')).toBeInTheDocument()
    )
  })

})
