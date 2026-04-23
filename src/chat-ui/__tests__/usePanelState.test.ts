// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { usePanelState } from '../usePanelState'

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
})

describe('usePanelState', () => {

  // Test 1: Initial state
  it('initial state: open=false, loaded=null, sessionStorage empty', () => {
    const { result } = renderHook(() => usePanelState())
    expect(result.current.open).toBe(false)
    expect(result.current.loaded).toBeNull()
    expect(sessionStorage.getItem('panel_open')).toBeNull()
  })

  // Test 2: autoOpenOnFirstCitation opens panel and writes sessionStorage
  it('autoOpenOnFirstCitation opens panel and sets loaded + sessionStorage', () => {
    const { result } = renderHook(() => usePanelState())

    act(() => {
      result.current.autoOpenOnFirstCitation('A', '1')
    })

    expect(result.current.open).toBe(true)
    expect(result.current.loaded).toEqual({ source_id: 'A', section_id: '1' })
    expect(sessionStorage.getItem('panel_open')).toBe('true')
  })

  // Test 3: Second autoOpenOnFirstCitation with panel still open updates loaded
  it('second autoOpenOnFirstCitation with panel open updates loaded to new source', () => {
    const { result } = renderHook(() => usePanelState())

    act(() => {
      result.current.autoOpenOnFirstCitation('A', '1')
    })
    act(() => {
      result.current.autoOpenOnFirstCitation('B', '2')
    })

    expect(result.current.open).toBe(true)
    expect(result.current.loaded).toEqual({ source_id: 'B', section_id: '2' })
  })

  // Test 4: closePanel after auto-open sets open=false but preserves loaded
  it('closePanel sets open=false but PRESERVES loaded (CONTEXT Close behaviour)', () => {
    const { result } = renderHook(() => usePanelState())

    act(() => {
      result.current.autoOpenOnFirstCitation('A', '1')
    })
    act(() => {
      result.current.closePanel()
    })

    expect(result.current.open).toBe(false)
    // loaded is preserved, NOT cleared
    expect(result.current.loaded).toEqual({ source_id: 'A', section_id: '1' })
    expect(sessionStorage.getItem('panel_open')).toBe('false')
  })

  // Test 5: After closePanel, autoOpenOnFirstCitation does NOT re-open (hasAutoOpened=true)
  it('after closePanel, autoOpenOnFirstCitation does not re-open the panel', () => {
    const { result } = renderHook(() => usePanelState())

    act(() => {
      result.current.autoOpenOnFirstCitation('A', '1')
    })
    act(() => {
      result.current.closePanel()
    })
    act(() => {
      result.current.autoOpenOnFirstCitation('C', '3')
    })

    // Panel stays closed — user explicitly closed it
    expect(result.current.open).toBe(false)
    // loaded NOT updated (panel closed means we skip the update branch)
    expect(result.current.loaded).toEqual({ source_id: 'A', section_id: '1' })
  })

  // Test 6: chipClick after closePanel re-opens panel
  it('chipClick re-opens panel and sets loaded even after user closed it', () => {
    const { result } = renderHook(() => usePanelState())

    act(() => {
      result.current.autoOpenOnFirstCitation('A', '1')
    })
    act(() => {
      result.current.closePanel()
    })
    act(() => {
      result.current.chipClick('C', '3')
    })

    expect(result.current.open).toBe(true)
    expect(result.current.loaded).toEqual({ source_id: 'C', section_id: '3' })
  })

  // Test 7: resetSession re-arms auto-open latch and clears loaded
  it('resetSession re-arms hasAutoOpened to false and clears loaded', () => {
    const { result } = renderHook(() => usePanelState())

    act(() => {
      result.current.autoOpenOnFirstCitation('A', '1')
    })
    act(() => {
      result.current.resetSession()
    })

    // loaded cleared
    expect(result.current.loaded).toBeNull()

    // Next citation auto-opens again (latch reset)
    act(() => {
      result.current.autoOpenOnFirstCitation('D', '4')
    })
    expect(result.current.open).toBe(true)
    expect(result.current.loaded).toEqual({ source_id: 'D', section_id: '4' })
  })

  // Test 8: sessionStorage discipline — string literals 'true'/'false' never booleans
  it('sessionStorage writes string literals "true"/"false", not booleans', () => {
    const { result } = renderHook(() => usePanelState())

    act(() => {
      result.current.autoOpenOnFirstCitation('A', '1')
    })
    // Must be the exact string 'true' (not boolean coercion)
    expect(sessionStorage.getItem('panel_open')).toBe('true')
    expect(sessionStorage.getItem('panel_open')).not.toBe('false')
    expect(sessionStorage.getItem('panel_open')).not.toBe('1')

    act(() => {
      result.current.closePanel()
    })
    expect(sessionStorage.getItem('panel_open')).toBe('false')
    expect(sessionStorage.getItem('panel_open')).not.toBe('true')
    expect(sessionStorage.getItem('panel_open')).not.toBe('0')
  })

  // Test 9: readInitial reads existing sessionStorage value on mount
  it('readInitial: if sessionStorage panel_open="true" on mount, hook starts open=true', () => {
    sessionStorage.setItem('panel_open', 'true')
    const { result } = renderHook(() => usePanelState())
    expect(result.current.open).toBe(true)
  })

  it('readInitial: sessionStorage "false" → open=false', () => {
    sessionStorage.setItem('panel_open', 'false')
    const { result } = renderHook(() => usePanelState())
    expect(result.current.open).toBe(false)
  })

  it('readInitial: truthy non-"true" string (e.g. "yes") is NOT treated as open (strict equality)', () => {
    sessionStorage.setItem('panel_open', 'yes')
    const { result } = renderHook(() => usePanelState())
    expect(result.current.open).toBe(false)
  })

})
