import type { ReactNode } from 'react'

/**
 * Fragment-passthrough nested layout — deliberately does NOT include Providers.
 *
 * Next.js App Router nested layouts REPLACE the parent layout for their route
 * segment (they do NOT wrap it), so returning a plain fragment here fully
 * overrides the root layout's <Providers> wrap while correctly delegating
 * <html>/<body> emission to the single root layout (nested layouts must NOT
 * emit <html>/<body> — that causes hydration warnings and invalid HTML).
 *
 * The /auth/redirect page calls broadcastResponseToMainFrame() and immediately
 * closes the popup / redirects back — it must NOT be wrapped in MsalProvider
 * because MSAL detects an `interaction_in_progress` state that would block
 * the response.
 *
 * Pitfall 7 guard. Phase 5 — Plan 05-04 Task 1.
 */
export default function AuthRedirectLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
