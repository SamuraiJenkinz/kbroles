// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSourceContent } from '../useSourceContent'
import type { SectionContent } from '../useSourceContent'

const MOCK_CONTENT: SectionContent = {
  source_id: 'KB0020882',
  section_id: 'resolution-field-software',
  title: 'Resolution Field — Software',
  body: '## Resolution Field — Software\n\nSome content here.',
  url: 'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0020882',
  version: '9.0',
}

const MOCK_CONTENT_B: SectionContent = {
  source_id: 'KB0022991',
  section_id: 'flagging-articles',
  title: 'Flagging Articles',
  body: '## Flagging Articles\n\nFlag content.',
  url: 'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0022991',
  version: '13.0',
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSourceContent', () => {

  // Test 1: Initial state with loaded=null
  it('initial state: content=null, loading=false, error=null', () => {
    vi.stubGlobal('fetch', vi.fn())
    const { result } = renderHook(() => useSourceContent(null))
    expect(result.current.content).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  // Test 2: Fetches with correct URL and populates content
  it('fetches correct URL and populates content after resolve', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_CONTENT), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useSourceContent({ source_id: 'KB0020882', section_id: 'resolution-field-software' })
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    await waitFor(() => expect(result.current.content).not.toBeNull())

    expect(result.current.content).toEqual(MOCK_CONTENT)
    expect(result.current.error).toBeNull()

    // Verify URL was encoded correctly
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('source_id=KB0020882')
    expect(calledUrl).toContain('section_id=resolution-field-software')
    expect(calledUrl).toContain('/api/sources')
  })

  // Test 3: Re-setting the same loaded pair uses cache (no second fetch)
  it('re-setting same loaded pair uses in-memory cache (no second fetch)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_CONTENT), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ loaded }) => useSourceContent(loaded),
      { initialProps: { loaded: { source_id: 'KB0020882', section_id: 'resolution-field-software' } as { source_id: string; section_id: string } | null } }
    )

    await waitFor(() => expect(result.current.content).not.toBeNull())
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Re-render with same loaded — should NOT trigger second fetch
    rerender({ loaded: { source_id: 'KB0020882', section_id: 'resolution-field-software' } })
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Still only one fetch (cache hit)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.content).toEqual(MOCK_CONTENT)
  })

  // Test 4: Switching loaded to a different pair triggers new fetch
  it('switching loaded to different pair triggers new fetch and updates content', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_CONTENT), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_CONTENT_B), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ loaded }) => useSourceContent(loaded),
      { initialProps: { loaded: { source_id: 'KB0020882', section_id: 'resolution-field-software' } as { source_id: string; section_id: string } | null } }
    )

    await waitFor(() => expect(result.current.content?.section_id).toBe('resolution-field-software'))

    rerender({ loaded: { source_id: 'KB0022991', section_id: 'flagging-articles' } })

    await waitFor(() => expect(result.current.content?.section_id).toBe('flagging-articles'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // Test 5: 500 status sets error, content remains null
  it('500 status response sets error and leaves content null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Server error', { status: 500 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useSourceContent({ source_id: 'KB0020882', section_id: 'resolution-field-software' })
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.content).toBeNull()
    expect(result.current.error).toContain('http_500')
  })

  // Test 6: Unmount during fetch calls AbortController.abort()
  it('unmount during fetch aborts the request (no state update warnings)', async () => {
    let capturedSignal: AbortSignal | undefined
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal
      // Never resolves during the test lifetime
      return new Promise<Response>((_, reject) => {
        const signal = init.signal as AbortSignal
        signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        )
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { unmount } = renderHook(() =>
      useSourceContent({ source_id: 'KB0020882', section_id: 'resolution-field-software' })
    )

    // Ensure fetch was called
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    // Unmount — should trigger abort
    unmount()

    expect(capturedSignal?.aborted).toBe(true)
  })

  // Test 7: loaded=null clears content
  it('switching loaded to null clears content and error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_CONTENT), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ loaded }) => useSourceContent(loaded),
      { initialProps: { loaded: { source_id: 'KB0020882', section_id: 'resolution-field-software' } as { source_id: string; section_id: string } | null } }
    )

    await waitFor(() => expect(result.current.content).not.toBeNull())

    rerender({ loaded: null })

    await waitFor(() => expect(result.current.content).toBeNull())
    expect(result.current.error).toBeNull()
  })

})
