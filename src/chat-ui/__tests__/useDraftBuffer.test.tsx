// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useDraftBuffer } from '../useDraftBuffer'

describe('useDraftBuffer', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    // Ensure fake timers are restored after each test (vi.useRealTimers is idempotent)
  })

  it('initial: draft is empty string, hydrated flips true post-mount', () => {
    const { result } = renderHook(() => useDraftBuffer())
    expect(result.current.draft).toBe('')
    expect(result.current.hydrated).toBe(true)
  })

  it('setDraft("hello") after debounce window writes sessionStorage', async () => {
    const { result } = renderHook(() => useDraftBuffer(250))
    act(() => { result.current.setDraft('hello') })
    // Before debounce fires — storage not yet written
    expect(sessionStorage.getItem('kbroles.draft')).toBeNull()
    // Advance fake-ish time: use real setTimeout with 0ms override for test speed
    // We use a short debounce to test without needing vi.useFakeTimers here.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 300))
    })
    expect(sessionStorage.getItem('kbroles.draft')).toBe('hello')
    expect(result.current.draft).toBe('hello')
  })

  it('calling setDraft twice within debounce window writes only last value', async () => {
    const { result } = renderHook(() => useDraftBuffer(250))
    act(() => { result.current.setDraft('a') })
    act(() => { result.current.setDraft('b') })
    // Storage must NOT have been written during intermediate tick
    expect(sessionStorage.getItem('kbroles.draft')).toBeNull()
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 300))
    })
    expect(sessionStorage.getItem('kbroles.draft')).toBe('b')
  })

  it('clearDraft() synchronously empties storage — no debounce', () => {
    sessionStorage.setItem('kbroles.draft', 'existing')
    const { result } = renderHook(() => useDraftBuffer())
    // Post-mount the draft hydrates with 'existing'
    expect(result.current.draft).toBe('existing')
    act(() => { result.current.clearDraft() })
    expect(result.current.draft).toBe('')
    expect(sessionStorage.getItem('kbroles.draft')).toBeNull()
  })

  it('setDraft("") after debounce removes the key (empty string treated as clear)', async () => {
    sessionStorage.setItem('kbroles.draft', 'existing')
    const { result } = renderHook(() => useDraftBuffer(250))
    act(() => { result.current.setDraft('') })
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 300))
    })
    expect(sessionStorage.getItem('kbroles.draft')).toBeNull()
    expect(result.current.draft).toBe('')
  })

  it('returning user: seeds draft from sessionStorage on mount', () => {
    sessionStorage.setItem('kbroles.draft', 'previous draft')
    const { result } = renderHook(() => useDraftBuffer())
    expect(result.current.draft).toBe('previous draft')
    expect(result.current.hydrated).toBe(true)
  })

  it('unmount clears pending timer — write does NOT fire after unmount', async () => {
    const { result, unmount } = renderHook(() => useDraftBuffer(250))
    act(() => { result.current.setDraft('abandoned') })
    // Storage not yet written (debounce pending)
    expect(sessionStorage.getItem('kbroles.draft')).toBeNull()
    // Unmount — timer should be cleared
    unmount()
    // Wait past debounce window
    await new Promise(resolve => setTimeout(resolve, 300))
    // Storage must remain null since timer was cleared on unmount
    expect(sessionStorage.getItem('kbroles.draft')).toBeNull()
  })
})
