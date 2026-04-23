/**
 * Phase-5 Entra ID JWT validator. Replaces the Phase-2 stub documented at
 * the top of this file previously. The Phase-2 PHASE 5 REPLACEMENT POINT
 * block described the four steps (a)-(d); this implementation fulfils them
 * plus adds token_expired / wrong_tenant discriminants for ErrorCard copy
 * + /access-denied routing (CONTEXT §Blocked-user UX, Plan 05-03).
 *
 * Dev/test permissive stub preserved: when NODE_ENV !== 'production' AND
 * there is no Authorization header, accept any caller as 'local-dev'. This
 * keeps Phase 2/3/4 route tests working without JWT stubbing.
 *
 * Module name intentionally starts with underscore so Next.js 16 does NOT
 * auto-register it as a route (same invariant as the Phase-2 stub).
 */
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose'
import { env } from '@/config/env'

export type AuthResult =
  | { sub: string; tenantId: string; preferredUsername?: string }
  | { error: 'unauthorized' }
  | { error: 'token_expired' }
  | { error: 'wrong_tenant' }

// JWKS is tenant-scoped in Entra v2. Cached module-level so concurrent
// requests share one in-memory cache. cooldownDuration prevents thundering-
// herd on key rotation; cacheMaxAge is 24h — Entra rotates rarely and
// JWKS supports multiple kids simultaneously during rotation.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (_jwks) return _jwks
  const tid = env().ENTRA_TENANT_ID
  _jwks = createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${tid}/discovery/v2.0/keys`),
    { cooldownDuration: 300_000, cacheMaxAge: 86_400_000 },
  )
  return _jwks
}

/** Test-only. Forces a fresh JWKS on next call — required by the mock-jwks
 * test pattern so each test's stubbed tenant GUID re-bootstraps the cache. */
export function __resetJwksForTests(): void {
  _jwks = null
}

export async function getRequestUser(request: Request): Promise<AuthResult> {
  // Dev/test permissive stub: no Authorization header AND non-production →
  // local-dev user. Production MUST have a Bearer token; the stub never
  // applies there (the NODE_ENV gate comes first).
  const auth = request.headers.get('authorization')
  if (process.env.NODE_ENV !== 'production' && !auth) {
    return { sub: 'local-dev', tenantId: 'local-dev' }
  }

  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return { error: 'unauthorized' }
  }
  const token = auth.slice('bearer '.length).trim()
  if (!token) return { error: 'unauthorized' }

  const { ENTRA_CLIENT_ID, ENTRA_TENANT_ID } = env()
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      // Pitfall 6: issuer MUST include trailing /v2.0 (Entra v2 claim shape).
      issuer: `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/v2.0`,
      // Pitfall 4: audience is the bare client-id GUID, NOT api://<guid>.
      audience: ENTRA_CLIENT_ID,
      algorithms: ['RS256'],
      clockTolerance: 60,
    })

    // Tenant allowlist — Phase-5's SOLE code-level gate (CONTEXT §Auth
    // boundary). Distinct 'wrong_tenant' discriminant so the caller can
    // route the user to /access-denied instead of re-prompting sign-in.
    if (payload.tid !== ENTRA_TENANT_ID) {
      return { error: 'wrong_tenant' }
    }

    const oid = typeof payload.oid === 'string' ? payload.oid : null
    const tid = typeof payload.tid === 'string' ? payload.tid : null
    if (!oid || !tid) return { error: 'unauthorized' }

    const preferredUsername =
      typeof payload.preferred_username === 'string'
        ? payload.preferred_username
        : undefined

    return { sub: oid, tenantId: tid, preferredUsername }
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return { error: 'token_expired' }
    }
    return { error: 'unauthorized' }
  }
}
