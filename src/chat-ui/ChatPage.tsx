'use client'
import { useIsAuthenticated, useMsal, useAccount } from '@azure/msal-react'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRolePersistence } from './useRolePersistence'
import { RoleSelect } from './RoleSelect'
import { ChatSurface } from './ChatSurface'
import { acquireToken } from '@/auth/tokenProvider'

/**
 * Auth gating is LAYERED on top of the existing role-persistence flow:
 *
 * 1. MSAL still initialising (inProgress !== 'none')  → skeleton
 * 2. Unauthenticated + MSAL idle  → kick off acquireToken(null) to trigger
 *    the host-aware sign-in flow (browser redirect OR Teams popup); render
 *    skeleton while we wait.
 * 3. Authenticated + tenant claim NOT on allowlist  → router.replace to
 *    /access-denied (Plan 05-02 shipped the page).
 * 4. Authenticated + allowed tenant  → existing useRolePersistence flow
 *    (hydrated → RoleSelect → ChatSurface).
 *
 * Plan 05-04 Task 2.
 */
const ALLOWED_TENANT = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID

export function ChatPage() {
  const isAuthenticated = useIsAuthenticated()
  const { accounts, inProgress } = useMsal()
  const account = useAccount(accounts[0] ?? undefined)
  const router = useRouter()
  const { role, setRole, hydrated } = useRolePersistence()

  // Wrong-tenant gate: authenticated but claims.tid not on allowlist.
  useEffect(() => {
    const tid = account?.idTokenClaims?.tid
    if (
      isAuthenticated &&
      tid &&
      ALLOWED_TENANT &&
      ALLOWED_TENANT !== 'dev-only-do-not-use-in-prod' &&
      tid !== ALLOWED_TENANT
    ) {
      router.replace('/access-denied')
    }
  }, [isAuthenticated, account, router])

  // Unauth + MSAL idle: kick off sign-in. acquireToken handles host-aware
  // interactive fallback (loginRedirect on browser, loginPopup on Teams).
  useEffect(() => {
    if (!isAuthenticated && inProgress === 'none') {
      acquireToken(null).catch(() => {
        // Silent-to-interactive threw; the user either saw a popup/redirect
        // or something went wrong. Surfacing an error here is noisy — MSAL's
        // events will land the user on /access-denied or re-render authed.
      })
    }
  }, [isAuthenticated, inProgress])

  if (inProgress !== 'none' || !isAuthenticated || !hydrated) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
        <div className="h-24 w-full max-w-md animate-pulse rounded-xl bg-neutral-card shadow-sm" />
      </main>
    )
  }

  if (role == null) {
    return <RoleSelect onPick={setRole} />
  }
  return <ChatSurface role={role} onChangeRole={() => setRole(null)} />
}
