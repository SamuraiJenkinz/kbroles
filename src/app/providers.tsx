'use client'
import * as Tooltip from '@radix-ui/react-tooltip'
import { AuthProvider } from '@/chat-ui/AuthProvider'
import type { ReactNode } from 'react'

/**
 * Root Providers wrap. Phase 5.1 — AuthProvider (BFF variant) replaces the
 * Phase-5 MsalProvider. Tooltip.Provider preserved so Phase-4 About Popover
 * tooltips continue to work.
 *
 * No more MSAL bootstrap, no more loading-skeleton-while-MSAL-initialises —
 * AuthProvider's /api/me fetch is the single async step, and ChatPage
 * renders its own skeleton during the 'loading' state.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Tooltip.Provider delayDuration={300} skipDelayDuration={100}>
        {children}
      </Tooltip.Provider>
    </AuthProvider>
  )
}
