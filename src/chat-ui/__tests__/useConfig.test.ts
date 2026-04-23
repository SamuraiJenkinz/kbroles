/**
 * useConfig tests — jsdom env for React hook testing.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useConfig, __resetConfigCacheForTests } from '../useConfig'

const MOCK_CONFIG = {
  versions: { KB0022991: '13.0', KB0020882: '9.0', SNOW_FORM: '2026-04-23' },
  contentStewardEmail: 'kb-knowledge-team@mmc.com',
}

beforeEach(() => {
  __resetConfigCacheForTests()
  vi.restoreAllMocks()
})

afterEach(() => {
  __resetConfigCacheForTests()
  vi.restoreAllMocks()
})

describe('useConfig', () => {
  // Test 1: Initial state — null config and null error
  it('returns {config: null, error: null} initially before fetch resolves', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
    )

    const { result } = renderHook(() => useConfig())
    expect(result.current.config).toBeNull()
    expect(result.current.error).toBeNull()
  })

  // Test 2: Fetch resolves → config populated
  it('populates config after fetch resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(MOCK_CONFIG), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const { result } = renderHook(() => useConfig())

    await waitFor(() => {
      expect(result.current.config).not.toBeNull()
    })

    expect(result.current.config).toEqual(MOCK_CONFIG)
    expect(result.current.error).toBeNull()
  })

  // Test 3: Multiple mounts share module-level cache (single fetch call)
  it('multiple renders share module-level cache — only one fetch total', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_CONFIG), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    // First hook render
    const { result: r1 } = renderHook(() => useConfig())
    await waitFor(() => expect(r1.current.config).not.toBeNull())

    // Second hook render (cache already warm — no new fetch)
    const { result: r2 } = renderHook(() => useConfig())
    await waitFor(() => expect(r2.current.config).not.toBeNull())

    // Only one fetch call across both renders
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(r2.current.config).toEqual(MOCK_CONFIG)
  })

  // Test 4: Fetch failure (500) → error set, config null
  it('sets error on non-ok response (500), keeps config null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Internal Server Error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    )

    const { result } = renderHook(() => useConfig())

    await waitFor(() => {
      expect(result.current.error).not.toBeNull()
    })

    expect(result.current.config).toBeNull()
    expect(result.current.error).toContain('http_500')
  })

  // Test 5: __resetConfigCacheForTests clears cache between tests
  it('__resetConfigCacheForTests clears module-level cache', async () => {
    const makeResponse = () =>
      new Response(JSON.stringify(MOCK_CONFIG), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    const fetchSpy = vi.fn().mockResolvedValue(makeResponse())
    vi.stubGlobal('fetch', fetchSpy)

    // First render — populates cache
    const { result: r1, unmount: u1 } = renderHook(() => useConfig())
    await waitFor(() => expect(r1.current.config).not.toBeNull())
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Unmount first instance so AbortController cleanup runs
    u1()

    // Reset cache + update spy with a fresh response for the second call
    __resetConfigCacheForTests()
    fetchSpy.mockResolvedValue(makeResponse())

    // Second render — cache is null again, should fetch again
    const { result: r2 } = renderHook(() => useConfig())
    await waitFor(() => expect(r2.current.config).not.toBeNull())
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
