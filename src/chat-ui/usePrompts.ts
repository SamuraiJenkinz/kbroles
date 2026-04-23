'use client'
import { useEffect, useState } from 'react'
import type { Role, ChipItem } from './types'

export function usePrompts(role: Role | null) {
  const [chips, setChips] = useState<ChipItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (role == null) { setChips([]); return }
    let cancelled = false
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/prompts?role=${role}`, { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP_${r.status}`)
        return r.json() as Promise<{ role: Role; prompts: ChipItem[] }>
      })
      .then(json => { if (!cancelled) setChips(json.prompts) })
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (!cancelled) { setChips([]); setError(String(err)) }
        // CONTEXT §Chip source: on failure, empty chip row; chat still works via freeform.
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true; ctrl.abort() }
  }, [role])

  return { chips, loading, error }
}
