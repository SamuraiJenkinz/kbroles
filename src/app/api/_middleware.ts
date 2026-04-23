/**
 * Phase-5.1 BFF session-cookie auth validator. REPLACES the Phase-5
 * jose+JWKS JWT validator; now returns an authenticated user based on the
 * iron-session cookie established at /api/auth/callback.
 *
 * Wire contract preserved:
 *   - unauthorized     → HTTP 401 { error: 'unauthorized' }
 *   - forbidden        → HTTP 403 { error: 'access_denied' }   (replaces wrong_tenant)
 *   - session_expired  → HTTP 401 { error: 'token_expired' }   (wire code unchanged so
 *                        frontend ErrorCard + useChatStream + 30+ assertions don't break)
 *
 * Dev/test permissive stub preserved: NODE_ENV !== 'production' AND no
 * session cookie → synthetic local-dev user with the required role. Phase
 * 2/3/4 route tests + local `pnpm dev` depend on this.
 *
 * Module name intentionally starts with underscore so Next.js does NOT
 * auto-register it as a route (Phase-2 invariant preserved).
 *
 * Phase 5.1 — Plan 04 Task 1.
 */
import { cookies } from 'next/headers'
import { getSession, SESSION_COOKIE_NAME } from '@/auth/session'

const REQUIRED_ROLE = 'KbAssistant.User'

export type AuthResult =
  | { sub: string; email: string; roles: string[] }
  | { error: 'unauthorized' }
  | { error: 'forbidden'; upn: string }
  | { error: 'session_expired' }

export async function getRequestUser(_request: Request): Promise<AuthResult> {
  const cookieStore = await cookies()

  // Dev/test permissive stub: non-production + no session cookie → local dev
  // user. Matches Phase-5's stub shape (local-dev subject) with the required
  // App Role pre-filled so role-gated code paths light up. Preserves Phase
  // 2/3/4 route tests that run without an authenticated session.
  if (
    process.env.NODE_ENV !== 'production' &&
    !cookieStore.get(SESSION_COOKIE_NAME)
  ) {
    return {
      sub: 'local-dev',
      email: 'local@dev',
      roles: [REQUIRED_ROLE],
    }
  }

  // Real path: read the session. iron-session decrypt failures (tampered,
  // wrong secret, expired cookie) produce an empty session object — treat
  // as unauthorized. iron-session also auto-expires based on the maxAge
  // set in getSessionOptions(); when the cookie passes maxAge, the browser
  // stops sending it and session.user becomes undefined.
  const session = await getSession(cookieStore)

  if (!session.user) {
    // Subtle discriminant: if the cookie was PRESENT on the request but
    // session.user is undefined, the likely cause is an expired/tampered
    // cookie (browser sent it but iron-session rejected it as too old).
    // Otherwise (no cookie at all) it's an unauthenticated visit. Both map
    // to the client-side 'sign back in' CTA, but the distinction helps
    // frontend UX: session_expired means "you were signed in; your session
    // timed out" (→ wire code `token_expired`) whereas unauthorized means
    // "you never signed in" (→ wire code `unauthorized`).
    if (cookieStore.get(SESSION_COOKIE_NAME)) {
      return { error: 'session_expired' }
    }
    return { error: 'unauthorized' }
  }

  // Pitfall 5 defence: Entra omits `roles` from id_token_claims entirely when
  // the user has NO app-role assignments (not an empty array — an undefined
  // field). Coerce to [] so `.includes()` below is safe and the missing-role
  // path returns `forbidden`, not an unauthorized error.
  const roles = session.user.roles ?? []
  if (!roles.includes(REQUIRED_ROLE)) {
    return { error: 'forbidden', upn: session.user.email }
  }

  return {
    sub: session.user.oid,
    email: session.user.email,
    roles,
  }
}
