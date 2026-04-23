'use client'
import { useCallback, useState } from 'react'

export interface LoadedSource { source_id: string; section_id: string }

const PANEL_OPEN_KEY = 'panel_open'

function readInitial(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(PANEL_OPEN_KEY) === 'true'  // strict equality — Pitfall from RESEARCH §sessionStorage type
}

export function usePanelState() {
  const [open, setOpenState] = useState<boolean>(readInitial)
  const [loaded, setLoaded] = useState<LoadedSource | null>(null)
  const [hasAutoOpened, setHasAutoOpened] = useState(false)

  const writeOpen = (next: boolean) => {
    if (typeof window !== 'undefined') sessionStorage.setItem(PANEL_OPEN_KEY, next ? 'true' : 'false')
    setOpenState(next)
  }

  const openPanel = useCallback((source_id: string, section_id: string) => {
    setLoaded({ source_id, section_id })
    writeOpen(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closePanel = useCallback(() => {
    writeOpen(false)
    // Do NOT clear `loaded` — close preserves which source was last shown (CONTEXT.md §Close behaviour)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Call on every assistant/citations dispatch. FIRST call of the session opens the
   * panel + records the source. Subsequent calls update `loaded` ONLY IF panel is
   * currently open (never re-open a panel the user closed — CONTEXT §Auto-open trigger).
   */
  const autoOpenOnFirstCitation = useCallback(
    (source_id: string, section_id: string) => {
      if (!hasAutoOpened) {
        setHasAutoOpened(true)
        setLoaded({ source_id, section_id })
        writeOpen(true)
      } else if (open) {
        setLoaded({ source_id, section_id })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasAutoOpened, open],
  )

  /**
   * Chip click — opens the panel if closed AND loads the requested source.
   * Always updates loaded regardless of `open`.
   */
  const chipClick = useCallback((source_id: string, section_id: string) => {
    setLoaded({ source_id, section_id })
    writeOpen(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Call on conversation/clear (New conversation or change role) to reset
   * the first-citation-auto-open latch. Does NOT force-close the panel.
   */
  const resetSession = useCallback(() => {
    setHasAutoOpened(false)
    setLoaded(null)
  }, [])

  return { open, loaded, openPanel, closePanel, autoOpenOnFirstCitation, chipClick, resetSession }
}
