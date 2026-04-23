'use client'
import { useEffect, useState } from 'react'
import type { Role } from './types'

const KEY = 'kbroles.role'

export function useRolePersistence() {
  const [role, setRoleState] = useState<Role | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const v = sessionStorage.getItem(KEY)
      if (v === 'consumer' || v === 'author') setRoleState(v)
    } catch { /* Safari private mode, etc. */ }
    setHydrated(true)
  }, [])

  const setRole = (next: Role | null) => {
    setRoleState(next)
    try {
      if (next == null) sessionStorage.removeItem(KEY)
      else sessionStorage.setItem(KEY, next)
    } catch { /* ignore */ }
  }

  return { role, setRole, hydrated }
}
