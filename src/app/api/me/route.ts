/**
 * GET /api/me — Phase 5.1 BFF authentication contract.
 *
 * Frontend AuthProvider (Plan 05) fetches this on mount. The response
 * shape drives auth state:
 *   - 200 { displayName, email, oid, roles }  → status:'authenticated'
 *   - 401 { error:'authentication_required' } → status:'unauthenticated'
 *                                                 → AuthProvider redirects
 *                                                   to /api/login
 *   - 403 { error:'forbidden', upn }           → status:'forbidden'
 *                                                 → AuthProvider routes to
 *                                                   /access-denied
 *
 * Matches xmcp app.py api_me() response shape exactly.
 *
 * Pitfall 1  — runtime:'nodejs' (iron-session needs Node crypto).
 * Pitfall 5  — roles may be undefined on an unassigned account; treat as
 *              empty array. /api/auth/callback already coerces before
 *              saving; this is defense-in-depth.
 * Pitfall 12 — loadSecrets() at top (SESSION_SECRET originates from AWS
 *              in prod; iron-session would throw otherwise).
 *
 * Cache-Control: no-store on every response so browsers + proxies never
 * serve stale auth state across users.
 */

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSession } from '@/auth/session'
import { loadSecrets } from '@/config/secrets'

const REQUIRED_ROLE = 'KbAssistant.User'

export async function GET(): Promise<Response> {
  await loadSecrets()
  const session = await getSession()

  if (!session.user) {
    return NextResponse.json(
      { error: 'authentication_required' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const roles = session.user.roles ?? []
  if (!roles.includes(REQUIRED_ROLE)) {
    return NextResponse.json(
      { error: 'forbidden', upn: session.user.email },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return NextResponse.json(
    {
      displayName: session.user.name,
      email: session.user.email,
      oid: session.user.oid,
      roles,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
