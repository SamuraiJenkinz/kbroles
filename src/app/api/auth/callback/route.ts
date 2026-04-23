/**
 * GET /api/auth/callback?code=...&state=... — Phase 5.1 auth code exchange.
 *
 * Exchanges the authorization code for tokens, reads id_token_claims, and
 * persists the user subset into an iron-session cookie. Redirects to /.
 *
 * Error paths:
 *   - ?error=... in query (user declined consent, tenant admin revoked, etc)
 *       → redirect to / (let AuthProvider re-drive login if still needed)
 *   - No ?code and no ?error (malformed callback)
 *       → redirect to /api/login
 *   - acquireTokenByCode throws (stale code, state mismatch — Pitfall 3)
 *       → redirect to /api/login (restart flow)
 *
 * Pitfall 1  — runtime:'nodejs'.
 * Pitfall 4  — redirect URI MUST match /api/login exactly (no trailing slash).
 * Pitfall 5  — claims.roles may be undefined when no App Role is assigned;
 *              coerce to [] BEFORE saving session. Defense-in-depth: /api/me
 *              reapplies this check.
 * Pitfall 10 — cookies() is async; saveSession() handles the await internally.
 * Pitfall 12 — loadSecrets() at top; module cache makes subsequent calls no-op.
 *
 * Anti-pattern NOT done here: raw result.accessToken / result.idToken JWT
 * strings are NOT stored in the session — only the decoded claims subset.
 */

export const runtime = 'nodejs'

import { type NextRequest, NextResponse } from 'next/server'
import { getCca } from '@/auth/msalClient'
import { saveSession } from '@/auth/session'
import { loadSecrets } from '@/config/secrets'
import { env } from '@/config/env'

const AUTH_SCOPES = ['openid', 'profile', 'email']

export async function GET(request: NextRequest): Promise<Response> {
  await loadSecrets()
  const { APP_BASE_URL } = env()
  const redirectUri = `${APP_BASE_URL}/api/auth/callback`

  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const errorCode = searchParams.get('error')

  if (errorCode) {
    // Entra surfaced an error (user declined, admin blocked, etc).
    // Redirect to root; the frontend AuthProvider will re-drive /api/login
    // if the user still needs auth.
    return NextResponse.redirect(new URL('/', APP_BASE_URL))
  }
  if (!code) {
    // Malformed callback — neither code nor error. Restart flow.
    return NextResponse.redirect(new URL('/api/login', APP_BASE_URL))
  }

  const cca = getCca()
  let result
  try {
    result = await cca.acquireTokenByCode({
      code,
      scopes: AUTH_SCOPES,
      redirectUri,
    })
  } catch {
    // Stale code, PKCE/state mismatch, network issue.
    // Safest recovery: restart the flow (msal-node will generate fresh PKCE).
    return NextResponse.redirect(new URL('/api/login', APP_BASE_URL))
  }

  if (!result || !result.idTokenClaims) {
    return NextResponse.redirect(new URL('/api/login', APP_BASE_URL))
  }

  const claims = result.idTokenClaims as Record<string, unknown>

  // Pitfall 5 — roles may be undefined, not empty array.
  const roles = Array.isArray(claims.roles) ? (claims.roles as string[]) : []

  await saveSession({
    oid: typeof claims.oid === 'string' ? claims.oid : '',
    email:
      typeof claims.preferred_username === 'string'
        ? claims.preferred_username
        : '',
    name: typeof claims.name === 'string' ? claims.name : '',
    roles,
  })

  return NextResponse.redirect(new URL('/', APP_BASE_URL))
}
