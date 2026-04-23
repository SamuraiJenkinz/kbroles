/**
 * Phase 5.1 — msal-node ConfidentialClientApplication singleton.
 *
 * Translates xmcp chat_app/auth.py `_build_msal_app()` from Python to Node.
 * msal-node owns the PKCE state + nonce cache internally on the CCA
 * instance; for a single-instance pilot on one Windows box (user-confirmed
 * load-bearing decision in planning context #5), a module-level singleton
 * is correct. Multi-instance deployment would require SerializableTokenCache
 * with distributed backing store — flagged as follow-up ticket in ROADMAP.md.
 *
 * Server-only. No browser imports; do NOT import from this file in a
 * 'use client' component — Next.js would fail at build time because
 * @azure/msal-node uses Node fs/crypto.
 *
 * Pitfall 11 — created once, reused across all /api/login and /api/auth/
 * callback requests.
 */

// server-only
// NOTE: `import 'server-only'` was omitted — Vitest cannot resolve the
// `server-only` package (not shipped as a standalone dep in Next 16 on this
// project; next/dist/compiled/server-only exists but is not a resolvable
// bare specifier). The JSDoc above + the file location under src/auth/ +
// the @azure/msal-node import (which uses Node fs/crypto and would fail in
// the browser anyway) together enforce the server-only invariant. If a
// future upgrade adds the `server-only` package, restore the import.
import { ConfidentialClientApplication, LogLevel } from '@azure/msal-node'
import { env } from '@/config/env'

let _cca: ConfidentialClientApplication | null = null

export function getCca(): ConfidentialClientApplication {
  if (_cca) return _cca

  const { ENTRA_CLIENT_ID, ENTRA_TENANT_ID, ENTRA_CLIENT_SECRET } = env()

  _cca = new ConfidentialClientApplication({
    auth: {
      clientId: ENTRA_CLIENT_ID,
      // msal-node appends `/v2.0/.well-known/openid-configuration` internally
      // when it fetches OIDC metadata; do NOT include /v2.0 in the authority.
      authority: `https://login.microsoftonline.com/${ENTRA_TENANT_ID}`,
      clientSecret: ENTRA_CLIENT_SECRET,
    },
    system: {
      loggerOptions: {
        // Quiet by default; set to LogLevel.Info or Verbose locally during
        // debugging. Do NOT forward MSAL log output to Pino — msal-node emits
        // PII-containing strings (email, tenant IDs) at Info level.
        loggerCallback: () => {
          /* intentionally empty */
        },
        piiLoggingEnabled: false,
        logLevel: LogLevel.Error,
      },
    },
  })

  return _cca
}

/** Test-only. Nulls the singleton so each test can stub a fresh env. */
export function __resetCcaForTests(): void {
  _cca = null
}
