'use client'
import * as Tooltip from '@radix-ui/react-tooltip'
import { MsalProvider } from '@azure/msal-react'
import type { IPublicClientApplication } from '@azure/msal-browser'
import { useEffect, useState, type ReactNode } from 'react'
import { getMsalInstance } from '@/auth/msalInstance'

/**
 * Client-only MSAL bootstrap. getMsalInstance() touches window/sessionStorage
 * so it can't run in the server render. We initialise in useEffect and render
 * a fallback skeleton until MSAL is ready.
 *
 * Composed with the existing Tooltip.Provider so Phase-4 About Popover tooltips
 * continue to work.
 *
 * NOTE: Nested-layout override. The /auth/redirect route segment ships its own
 * fragment-passthrough layout (src/app/auth/redirect/layout.tsx) that entirely
 * REPLACES this Providers wrap for that segment — because Next.js App Router
 * nested layouts replace the parent layout for their segment (they do not
 * wrap it). Without that override, MsalProvider would fire
 * `interaction_in_progress` errors on the COOP redirect bridge page
 * (Pitfall 7 guard — Plan 05-04 Task 1).
 *
 * Phase 5 — Plan 05-04 Task 1.
 */
function AuthProvider({ children }: { children: ReactNode }) {
  const [msal, setMsal] = useState<IPublicClientApplication | null>(null)

  useEffect(() => {
    let cancelled = false
    getMsalInstance()
      .then((instance) => {
        if (!cancelled) setMsal(instance)
      })
      .catch(() => {
        // getMsalInstance throws in pure-server contexts; we're a 'use client'
        // component with a useEffect gate so this branch should be unreachable
        // in practice. Swallow to keep the skeleton visible rather than
        // throwing into React.
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!msal) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
        <div className="h-24 w-full max-w-md animate-pulse rounded-xl bg-neutral-card shadow-sm" />
      </main>
    )
  }

  return <MsalProvider instance={msal}>{children}</MsalProvider>
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Tooltip.Provider delayDuration={300} skipDelayDuration={100}>
        {children}
      </Tooltip.Provider>
    </AuthProvider>
  )
}
