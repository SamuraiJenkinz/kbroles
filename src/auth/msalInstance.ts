/**
 * Singleton nestable PublicClientApplication.
 *
 * Phase 5 — createNestablePublicClientApplication is the MSAL v5 entry point
 * for Nested App Authentication (NAA). It auto-falls-back to a standard
 * PublicClientApplication when not running inside a Teams host, so the same
 * instance works on both the standalone web client AND inside a Teams tab
 * ("single codebase" invariant — CONTEXT §Auth boundary).
 *
 * MUST only be called from a browser context — touches window / sessionStorage.
 * Calling from a server component (e.g. app/layout.tsx) is a hard error per
 * RESEARCH §Anti-Patterns. AuthProvider (Plan 04) handles this via useEffect
 * / 'use client'.
 */
import type { IPublicClientApplication } from '@azure/msal-browser'
import { createNestablePublicClientApplication } from '@azure/msal-browser'
import { msalConfig } from './msalConfig'

let _instance: IPublicClientApplication | null = null
let _initPromise: Promise<IPublicClientApplication> | null = null

export async function getMsalInstance(): Promise<IPublicClientApplication> {
  if (typeof window === 'undefined') {
    throw new Error(
      'getMsalInstance() must be called in browser context. Do not import from a server component; wrap with "use client".',
    )
  }
  if (_instance) return _instance
  if (_initPromise) return _initPromise

  _initPromise = createNestablePublicClientApplication(msalConfig).then((pca) => {
    _instance = pca
    _initPromise = null
    return pca
  })
  return _initPromise
}

/** Test-only reset. */
export function __resetMsalForTests(): void {
  _instance = null
  _initPromise = null
}
