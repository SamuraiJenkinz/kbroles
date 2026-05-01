/**
 * GET /api/login — Phase 5.1 auth code flow initiator.
 *
 * Calls msal-node's getAuthCodeUrl() to build the Entra authorize URL and
 * 302s the user there. msal-node stores the PKCE verifier + state internally
 * on the CCA singleton (module-level in msalClient.ts); the /api/auth/callback
 * handler on the SAME process validates them on code exchange.
 *
 * Pitfall 1 — runtime:'nodejs' required (iron-session + msal-node need Node
 *   crypto/fs; Edge Runtime would fail to bundle).
 * Pitfall 3 — single-instance pilot assumed (planning context #5); multi-
 *   instance would require SerializableTokenCache with distributed backing.
 * Pitfall 4 — redirect URI constructed once from APP_BASE_URL with NO
 *   trailing slash; must match Entra App Registration exactly (AADSTS50011).
 * Pitfall 12 — loadSecrets() at top; module-level cache makes subsequent
 *   calls no-op.
 * Pitfall 13 — msal-node 5.1.4 getAuthCodeUrl() returns a path-only URL
 *   (e.g. '/<tenant>/oauth2/v2.0/authorize?...') rather than the absolute
 *   'https://login.microsoftonline.com/<tenant>/...' the authority config
 *   implies. NextResponse.redirect resolves path-only URLs against the
 *   request host, sending users to our 404 instead of Entra. Defensive
 *   absolute-URL coercion is applied before redirect; it becomes a no-op
 *   if upstream msal-node is fixed to return absolute URLs again.
 */

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { ResponseMode } from '@azure/msal-node'
import { getCca } from '@/auth/msalClient'
import { loadSecrets } from '@/config/secrets'
import { env } from '@/config/env'

const AUTH_SCOPES = ['openid', 'profile', 'email']

export async function GET(): Promise<Response> {
  await loadSecrets()
  const { APP_BASE_URL } = env()
  const redirectUri = `${APP_BASE_URL}/api/auth/callback`

  const cca = getCca()
  const authUrl = await cca.getAuthCodeUrl({
    scopes: AUTH_SCOPES,
    redirectUri,
    responseMode: ResponseMode.QUERY,
  })

  // Defensive: msal-node 5.1.4 (and possibly other versions) returns a path-
  // only URL like '/<tenant>/oauth2/v2.0/authorize?...' from getAuthCodeUrl()
  // rather than the absolute 'https://login.microsoftonline.com/<tenant>/...'
  // the authority config implies. NextResponse.redirect resolves path-only
  // URLs against the request host, sending users to our 404 instead of Entra.
  // Force absolute by prepending the canonical login.microsoftonline.com host
  // when the URL doesn't already include a scheme. If upstream msal-node
  // starts returning absolute URLs again, this becomes a harmless no-op.
  // Quick task 003 (2026-04-29) — converts the deploy-day workaround into the
  // real fix. See .planning/quick/003-fix-pilot-deploy-workarounds-into-real-fixes/.
  const absoluteAuthUrl = /^https?:\/\//i.test(authUrl)
    ? authUrl
    : `https://login.microsoftonline.com${authUrl.startsWith('/') ? '' : '/'}${authUrl}`

  return NextResponse.redirect(absoluteAuthUrl)
}
