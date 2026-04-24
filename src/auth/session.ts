/**
 * Phase 5.1 — iron-session wrapper.
 *
 * Replaces the Phase-5 jose JWT-per-request pattern with an HttpOnly session
 * cookie established once at /api/auth/callback. Translates xmcp Flask
 * `session["user"] = result.get("id_token_claims")` + `session.clear()`.
 *
 * Server-only. iron-session uses Node crypto.createCipheriv; Edge Runtime is
 * not supported. All route handlers that touch the session MUST set
 * `export const runtime = 'nodejs'` (Pitfall 1).
 *
 * Pitfall 2 — getSessionOptions() is a FUNCTION, not a top-level const. It
 * reads env().SESSION_SECRET lazily so AWS Secrets Manager (loadSecrets
 * from Plan 01) has had a chance to populate process.env by the time the
 * first request arrives.
 *
 * Pitfall 10 — Next.js 15 cookies() is async. All helpers accept an optional
 * pre-awaited cookieStore for ergonomics + testability.
 */

// server-only
// NOTE: `import 'server-only'` was omitted — Vitest cannot resolve the
// `server-only` package (not shipped as a standalone dep in Next 16 on this
// project). The JSDoc above + the file location under src/auth/ + the
// `next/headers` import (which only exists at the Next.js App-Router server
// boundary) together enforce the server-only invariant. If a future upgrade
// adds the `server-only` package, restore the import.
import type { SessionOptions } from 'iron-session'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { env } from '@/config/env'
import { hashIdentifier } from '@/obs/questionHash'

export interface SessionData {
  user?: {
    oid: string
    email: string
    name: string
    roles: string[]
  }
}

export const SESSION_COOKIE_NAME = 'kb_session'

export function getSessionOptions(): SessionOptions {
  return {
    password: env().SESSION_SECRET,
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      // 8-hour business-day session. iron-session re-seals on save so this
      // is a hard expiry relative to the LAST save call, not to login time.
      maxAge: 60 * 60 * 8,
    },
  }
}

/**
 * Reads the session from the current request's cookie jar. Caller passes
 * the Next.js 15 `await cookies()` result OR omits the arg (this helper
 * awaits cookies() internally).
 *
 * Returns an iron-session proxy object; read `session.user` to access
 * authenticated claims, or check presence to detect unauthenticated state.
 */
export async function getSession(cookieStore?: Awaited<ReturnType<typeof cookies>>) {
  const store = cookieStore ?? (await cookies())
  return getIronSession<SessionData>(store, getSessionOptions())
}

/**
 * Persists the user claims subset into the session cookie and calls save().
 * Used by /api/auth/callback after acquireTokenByCode().
 */
export async function saveSession(
  user: NonNullable<SessionData['user']>,
  cookieStore?: Awaited<ReturnType<typeof cookies>>,
): Promise<void> {
  const session = await getSession(cookieStore)
  session.user = user
  await session.save()
}

/**
 * Clears the session cookie. Used by /api/logout.
 */
export async function clearSession(
  cookieStore?: Awaited<ReturnType<typeof cookies>>,
): Promise<void> {
  const session = await getSession(cookieStore)
  session.destroy()
}

// ---------------------------------------------------------------------------
// Telemetry helpers (Phase 6 — Plan 02)
//
// These helpers produce PII-safe 16-hex-char hashes for use as telemetry
// correlation keys. They accept an iron-session IronSession<SessionData>
// object (the return type of getSession()) and return undefined when the
// session is unauthenticated, so callers can safely spread the result into
// EventDimensions without emitting undefined values (trackEvent() strips them
// automatically, but explicit undefined makes intent clear).
// ---------------------------------------------------------------------------

/**
 * Returns a stable 16-hex-char hash of the session's Entra OID.
 *
 * Uses `oid` (Entra object ID) as the stable session-level identifier.
 * The OID is stable across token refreshes and cookie rotations, which makes
 * it a better join key than the iron-session cookie binary or a transient
 * access token claim.
 *
 * Returns undefined when the session has no authenticated user so that
 * unauthenticated health probes don't emit a hash for an empty string.
 */
export function getSessionIdHash(
  session: { user?: SessionData['user'] },
): string | undefined {
  if (!session.user?.oid) return undefined
  return hashIdentifier(session.user.oid)
}

/**
 * Returns a stable 16-hex-char hash of the session's email (preferred_username).
 *
 * Used for per-user distinct-count queries in workbooks without storing UPN.
 * `email` in SessionData maps to Entra's `preferred_username` claim (set at
 * /api/auth/callback) — it is stable for a given Azure AD user.
 *
 * Returns undefined when the session has no authenticated user.
 */
export function getUserIdHash(
  session: { user?: SessionData['user'] },
): string | undefined {
  if (!session.user?.email) return undefined
  return hashIdentifier(session.user.email)
}
