'use client'
import { useEffect, useRef, useState } from 'react'
import type { LoadedSource } from './usePanelState'

export interface SectionContent {
  source_id: string
  section_id: string
  title: string
  body: string
  url: string
  version: string
}

export function useSourceContent(loaded: LoadedSource | null): {
  content: SectionContent | null
  loading: boolean
  error: string | null
} {
  const [content, setContent] = useState<SectionContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef<Map<string, SectionContent>>(new Map())

  useEffect(() => {
    if (!loaded) {
      setContent(null)
      setError(null)
      return
    }
    const key = `${loaded.source_id}/${loaded.section_id}`
    const cached = cacheRef.current.get(key)
    if (cached) {
      setContent(cached)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const ctrl = new AbortController()
    fetch(
      `/api/sources?source_id=${encodeURIComponent(loaded.source_id)}&section_id=${encodeURIComponent(loaded.section_id)}`,
      { signal: ctrl.signal },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`http_${res.status}`)
        const json = (await res.json()) as SectionContent
        cacheRef.current.set(key, json)
        setContent(json)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(String(err))
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [loaded?.source_id, loaded?.section_id])

  return { content, loading, error }
}
