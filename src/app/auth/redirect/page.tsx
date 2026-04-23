'use client'
import { useEffect } from 'react'

/**
 * MSAL v5 COOP redirect bridge. When Entra redirects back here after sign-in,
 * this page forwards the auth response to the main frame via the message
 * channel MSAL sets up. Without this, Entra's Cross-Origin-Opener-Policy
 * headers break the redirect flow.
 *
 * The subpath export `@azure/msal-browser/redirect-bridge` exposes
 * `broadcastResponseToMainFrame` in v5.8.0 (verified against the installed
 * package's `exports` field + dist/redirect-bridge/redirect_bridge/index.d.ts).
 * The function is async and returns Promise<void> — fire-and-forget is fine
 * because the whole page exists only to resolve the interaction and then the
 * main frame takes over.
 *
 * If a future minor moves or renames the subpath export, the catch-branch
 * falls back to a hard redirect to '/' so the app bootstraps and MSAL's
 * standard handleRedirectPromise() picks up the hash/state on its own.
 *
 * RESEARCH Pattern 2 + Pitfall 1. Phase 5 — Plan 05-04 Task 1.
 */
export default function AuthRedirectPage() {
  useEffect(() => {
    void (async () => {
      try {
        const mod = await import('@azure/msal-browser/redirect-bridge')
        await mod.broadcastResponseToMainFrame()
      } catch {
        // Bridge import moved OR broadcast threw (e.g. state missing after a
        // stale refresh). Fall back to main-app bootstrap — MSAL will pick
        // up any residual hash on its own via handleRedirectPromise().
        if (typeof window !== 'undefined') window.location.replace('/')
      }
    })()
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-sm text-neutral-500">
      Signing in…
    </main>
  )
}
