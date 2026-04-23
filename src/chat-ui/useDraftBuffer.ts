'use client'
import { useEffect, useRef, useState } from 'react'

const KEY = 'kbroles.draft'
const DEFAULT_DEBOUNCE_MS = 250

export function useDraftBuffer(debounceMs: number = DEFAULT_DEBOUNCE_MS) {
  const [draft, setDraftState] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mount-gate read
  useEffect(() => {
    try {
      const v = sessionStorage.getItem(KEY)
      if (v) setDraftState(v)
    } catch { /* ignore */ }
    setHydrated(true)
  }, [])

  // Debounced write
  const setDraft = (next: string) => {
    setDraftState(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      try {
        if (next === '') sessionStorage.removeItem(KEY)
        else sessionStorage.setItem(KEY, next)
      } catch { /* ignore */ }
    }, debounceMs)
  }

  const clearDraft = () => {
    setDraftState('')
    if (timerRef.current) clearTimeout(timerRef.current)
    try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
  }

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { draft, setDraft, clearDraft, hydrated }
}
