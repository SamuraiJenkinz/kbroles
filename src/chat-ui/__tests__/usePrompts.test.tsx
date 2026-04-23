// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePrompts } from '../usePrompts'
import type { ChipItem, Role } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeChips(role: Role, count: number): ChipItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${role}-chip-${i}`,
    label: `${role} label ${i}`,
    text: `${role} question ${i}`,
  }))
}

const consumerChips = makeChips('consumer', 5)
const authorChips = makeChips('author', 8)

function mockFetchOk(responseBody: unknown) {
  return vi.fn().mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(responseBody),
  } as unknown as Response)
}

function mockFetchError(err: Error) {
  return vi.fn().mockRejectedValueOnce(err)
}

function mockFetchStatus(status: number) {
  return vi.fn().mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ error: `http_${status}` }),
  } as unknown as Response)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('usePrompts', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('role=null returns empty chips immediately, no fetch', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => usePrompts(null))

    expect(result.current.chips).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('role="consumer" fetches with correct URL and returns exactly 5 chips', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ role: 'consumer', prompts: consumerChips }),
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => usePrompts('consumer'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/prompts?role=consumer')
    // CHECKER Issue 4: explicit count assertion
    expect(result.current.chips).toHaveLength(5)
    expect(result.current.error).toBeNull()
  })

  it('role="author" fetches with correct URL and returns exactly 8 chips', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ role: 'author', prompts: authorChips }),
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => usePrompts('author'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/prompts?role=author')
    // CHECKER Issue 4: explicit count assertion
    expect(result.current.chips).toHaveLength(8)
    expect(result.current.error).toBeNull()
  })

  it('network error returns empty chips and non-null error string', async () => {
    const networkErr = new Error('Network failure')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(networkErr))

    const { result } = renderHook(() => usePrompts('consumer'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.chips).toEqual([])
    expect(result.current.error).not.toBeNull()
    expect(typeof result.current.error).toBe('string')
  })

  it('HTTP 500 returns empty chips and error string containing "HTTP_500"', async () => {
    vi.stubGlobal('fetch', mockFetchStatus(500))

    const { result } = renderHook(() => usePrompts('consumer'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.chips).toEqual([])
    expect(result.current.error).toContain('HTTP_500')
  })

  it('role change from "consumer" to "author" issues new fetch and flips chip count 5 → 8', async () => {
    let callIdx = 0
    const capturedSignals: AbortSignal[] = []

    const fetchSpy = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedSignals.push(init.signal as AbortSignal)
      const idx = callIdx++
      if (idx === 0) {
        return new Promise(resolve =>
          setTimeout(() => resolve({
            ok: true,
            json: () => Promise.resolve({ role: 'consumer', prompts: consumerChips }),
          }), 50)
        )
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ role: 'author', prompts: authorChips }),
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { result, rerender } = renderHook(
      ({ role }: { role: Role }) => usePrompts(role),
      { initialProps: { role: 'consumer' as Role } },
    )

    // Switch to author before consumer resolves
    rerender({ role: 'author' })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      // CHECKER Issue 4: chip count flips to 8
      expect(result.current.chips).toHaveLength(8)
    })

    // Prior consumer fetch was aborted
    expect(capturedSignals[0].aborted).toBe(true)
    // A second fetch was issued
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
