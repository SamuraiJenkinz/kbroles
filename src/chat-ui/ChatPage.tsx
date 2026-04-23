'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { useRolePersistence } from './useRolePersistence'
import { RoleSelect } from './RoleSelect'
import { ChatSurface } from './ChatSurface'

/**
 * Phase 5.1 — ChatPage gated on BFF useAuth() status.
 *
 * State machine:
 *   loading         → skeleton
 *   unauthenticated → hard-navigate to /api/login (302 to Entra)
 *   forbidden       → router.replace('/access-denied')
 *   error           → (rare; render skeleton — /api/me will be retried on next mount)
 *   authenticated   → existing role-persistence flow (RoleSelect → ChatSurface)
 *
 * /api/login is a route handler that 302s to Entra, so unauthenticated
 * redirect MUST be a top-level GET (window.location.href), not a Next.js
 * router transition (which treats the URL as an internal page).
 *
 * No MSAL hooks, no tenant allowlist check (the backend /api/me enforces
 * App Role membership; 403 → forbidden → /access-denied).
 */
export function ChatPage() {
  const { status } = useAuth()
  const router = useRouter()
  const { role, setRole, hydrated } = useRolePersistence()

  useEffect(() => {
    if (status === 'unauthenticated') {
      window.location.href = '/api/login'
    }
    if (status === 'forbidden') {
      router.replace('/access-denied')
    }
  }, [status, router])

  if (
    status === 'loading' ||
    status === 'unauthenticated' ||
    status === 'forbidden' ||
    status === 'error' ||
    !hydrated
  ) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
        <div className="h-24 w-full max-w-md animate-pulse rounded-xl bg-neutral-card shadow-sm" />
      </main>
    )
  }

  // status === 'authenticated' — render existing role flow.
  if (role == null) return <RoleSelect onPick={setRole} />
  return <ChatSurface role={role} onChangeRole={() => setRole(null)} />
}
