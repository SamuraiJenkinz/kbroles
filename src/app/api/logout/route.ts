/**
 * GET /api/logout — Phase 5.1 session clear + redirect.
 *
 * Matches xmcp's /api/logout behaviour: local session clear only. Does NOT
 * redirect to Entra's global logout URL — the pilot is single-app and the
 * user rarely wants to sign out of all MMC apps. A future v1.1 can add
 * an `?all=true` query param for Entra global logout if users ask.
 *
 * Pitfall 1  — runtime:'nodejs' (iron-session needs Node crypto).
 * Pitfall 10 — clearSession() handles async cookies() internally.
 * Pitfall 12 — loadSecrets() at top (APP_BASE_URL may originate from AWS).
 */

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { clearSession } from '@/auth/session'
import { loadSecrets } from '@/config/secrets'
import { env } from '@/config/env'

export async function GET(): Promise<Response> {
  await loadSecrets()
  const { APP_BASE_URL } = env()
  await clearSession()
  return NextResponse.redirect(new URL('/', APP_BASE_URL))
}
