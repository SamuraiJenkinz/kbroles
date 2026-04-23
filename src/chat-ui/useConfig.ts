'use client'
import { useEffect, useState } from 'react'

export interface ConfigData {
  versions: { KB0022991: string; KB0020882: string; SNOW_FORM: string }
  contentStewardEmail: string
}

let _cache: ConfigData | null = null

export function useConfig(): { config: ConfigData | null; error: string | null } {
  const [config, setConfig] = useState<ConfigData | null>(_cache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (_cache) return
    const ctrl = new AbortController()
    fetch('/api/config', { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`http_${res.status}`)
        const json = (await res.json()) as ConfigData
        _cache = json
        setConfig(json)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(String(err))
      })
    return () => ctrl.abort()
  }, [])

  return { config, error }
}

// Test-only cache reset — DO NOT call in production code
export function __resetConfigCacheForTests(): void {
  _cache = null
}
