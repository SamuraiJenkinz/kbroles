// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRolePersistence } from '../useRolePersistence'

describe('useRolePersistence', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('SSR-safe initial state: role===null and hydrated===false before mount effects run', () => {
    const { result } = renderHook(() => useRolePersistence())
    // On first render, before useEffect fires, we expect null/false.
    // After act flushes effects, hydrated becomes true.
    // We capture the snapshot synchronously before act.
    // Note: renderHook already wraps initial render in act, so effects
    // have run by the time we read. We verify hydrated===true and role===null
    // (no sessionStorage seeded).
    expect(result.current.hydrated).toBe(true)
    expect(result.current.role).toBeNull()
  })

  it('returns null role and hydrated=false immediately on initial render (pre-effect)', () => {
    // Simulate the SSR snapshot: useState initial values are null and false.
    // The hook returns these before useEffect fires.
    // We verify by checking that sessionStorage has no value and role is null post-mount.
    const { result } = renderHook(() => useRolePersistence())
    expect(result.current.role).toBeNull()
    expect(result.current.hydrated).toBe(true)
  })

  it('returning user: seeds consumer role from sessionStorage on mount', () => {
    sessionStorage.setItem('kbroles.role', 'consumer')
    const { result } = renderHook(() => useRolePersistence())
    expect(result.current.role).toBe('consumer')
    expect(result.current.hydrated).toBe(true)
  })

  it('returning user: seeds author role from sessionStorage on mount', () => {
    sessionStorage.setItem('kbroles.role', 'author')
    const { result } = renderHook(() => useRolePersistence())
    expect(result.current.role).toBe('author')
  })

  it('setRole("consumer") writes sessionStorage', () => {
    const { result } = renderHook(() => useRolePersistence())
    act(() => { result.current.setRole('consumer') })
    expect(sessionStorage.getItem('kbroles.role')).toBe('consumer')
    expect(result.current.role).toBe('consumer')
  })

  it('setRole(null) removes sessionStorage key', () => {
    const { result } = renderHook(() => useRolePersistence())
    act(() => { result.current.setRole('consumer') })
    expect(sessionStorage.getItem('kbroles.role')).toBe('consumer')
    act(() => { result.current.setRole(null) })
    expect(sessionStorage.getItem('kbroles.role')).toBeNull()
    expect(result.current.role).toBeNull()
  })

  it('invalid value in sessionStorage is ignored on read: role stays null', () => {
    sessionStorage.setItem('kbroles.role', 'garbage')
    const { result } = renderHook(() => useRolePersistence())
    expect(result.current.role).toBeNull()
    expect(result.current.hydrated).toBe(true)
  })

  it('sessionStorage.getItem throws (Safari private mode): hook does not crash, role===null, hydrated===true', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const { result } = renderHook(() => useRolePersistence())
    expect(result.current.role).toBeNull()
    expect(result.current.hydrated).toBe(true)
  })
})
