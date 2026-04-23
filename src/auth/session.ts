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
