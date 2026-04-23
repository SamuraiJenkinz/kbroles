'use client'
import { useCallback, useEffect, useState } from 'react'

const SEEN_KEY = 'about_tooltip_seen_v1'

/**
 * Manages the About popover state:
 *  - First-run auto-open via localStorage (one per device)
 *  - ℹ button always re-opens
 *  - "Got it" / X dismiss persists the seen flag
 *
 * SSR/hydration note: `seen` defaults to `true` to prevent a flash where
 * the popover appears during SSR then closes after hydration. The useEffect
 * on mount reads localStorage and potentially sets `seen=false` + `open=true`
 * for genuine first-run users.
 */
export function useAboutTooltip() {
  // Default seen=true prevents SSR/hydration flash (RESEARCH Pattern 8).
  const [seen, setSeen] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const isSeen =
      typeof window !== 'undefined' &&
      localStorage.getItem(SEEN_KEY) === 'true'
    setSeen(isSeen)
    if (!isSeen) setOpen(true)
  }, [])

  const dismiss = useCallback(() => {
    setOpen(false)
    setSeen(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem(SEEN_KEY, 'true')
    }
  }, [])

  const reopen = useCallback(() => setOpen(true), [])

  return { open, setOpen, dismiss, reopen, seen }
}
