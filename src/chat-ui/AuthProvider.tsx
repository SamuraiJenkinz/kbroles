'use client'
/**
 * Phase 5.1 — BFF AuthProvider.
 *
 * Replaces the Phase-5 MsalProvider wrap. On mount, fetches /api/me and
 * transitions state through loading → authenticated | unauthenticated
 * | forbidden | error. Consumers call useAuth() to read the state.
 *
 * Matches xmcp frontend/src/contexts/AuthContext.tsx exactly — the status
 * enum + response shape are deliberately identical so anyone who has read
 * xmcp recognises the pattern.
 *
 * Navigation decisions (redirect to /api/login on unauth; router.replace to
 * /access-denied on forbidden) live in ChatPage, NOT here — AuthProvider is
 * a pure state container.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'

export interface AuthUser {
  displayName: string
  email: string
  oid: string
  roles: string[]
}

export interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  upn: string | null // populated when status === 'forbidden'
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    upn: null,
  })

  useEffect(() => {
    let cancelled = false
    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 401) {
          setState({ status: 'unauthenticated', user: null, upn: null })
          return
        }
        if (res.status === 403) {
          let upn = ''
          try {
            const body = (await res.json()) as { upn?: string }
            upn = body.upn ?? ''
          } catch {
            /* body may be empty */
          }
          setState({ status: 'forbidden', user: null, upn })
          return
        }
        if (res.ok) {
          const user = (await res.json()) as AuthUser
          setState({ status: 'authenticated', user, upn: null })
          return
        }
        setState({ status: 'error', user: null, upn: null })
      })
      .catch(() => {
        if (cancelled) return
        setState({ status: 'error', user: null, upn: null })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
