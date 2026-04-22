// STUB MIDDLEWARE — DO NOT DEPLOY TO PROD WITHOUT PHASE 5 MSAL WIRING.
//
// PHASE 5 REPLACEMENT POINT: swap the stub below for:
//   (a) read  Authorization: Bearer <token>  header
//   (b) validate JWT against the Entra issuer + audience
//   (c) enforce env().ENTRA_TENANT_ID tenant allowlist (add the field to
//       EnvSchema in src/config/env.ts at that time — it is intentionally
//       NOT in the schema today so Phase-2 tests don't need to stub it)
//   (d) return { sub: jwt.oid, tenantId: jwt.tid }  OR  { error: 'unauthorized' }
//
// See STACK.md §5.5 and ARCHITECTURE.md §16 Phase C step 12 for the full
// MSAL integration blueprint. The helper-wrapper pattern (vs Next.js global
// middleware.ts) is deliberate — per 02-CONTEXT.md "Claude's Discretion",
// Route Handlers in the Node runtime don't get the Edge-middleware matcher
// treatment, and a per-route getRequestUser() call is cleanest to swap in
// Phase 5. This module is intentionally named with a leading underscore so
// Next.js 16 does NOT auto-register it as a route — Plan 04 Task 2 imports
// getRequestUser at /api/chat route entry.
//
// Phase 5 integration shape (for reference; do not enable until Phase 5):
//   import { env } from '@/config/env'          // env().ENTRA_TENANT_ID
//   import { jwtVerify } from 'jose'            // JWKS + audience check
// The env() surface is the sole env-reading contract per the 'Key Links'
// block of 01-infra-ops-setup-PLAN.md.

/**
 * getRequestUser — resolve the authed identity for a Next.js Route Handler
 * request. Returns { sub, tenantId } on success or { error: 'unauthorized' }
 * on failure. In development and test, any caller is accepted as the
 * local-dev user (permissive stub). In production, until Phase 5 replaces
 * this, we accept any `Authorization: Bearer <anything>` header and echo a
 * placeholder user — this is deliberately a DEPLOYMENT BLOCKER until Phase 5
 * wires real JWT verification (see STACK.md §5.5).
 */
export function getRequestUser(
  request: Request,
):
  | { sub: string; tenantId: string }
  | { error: 'unauthorized' }
{
  // Dev + test: permissive stub — ANY caller becomes a local-dev user. This
  // lets Plan 04's route-handler tests focus on chat behaviour without
  // auth plumbing and lets `next dev` work without MSAL setup.
  if (process.env.NODE_ENV !== 'production') {
    return { sub: 'local-dev', tenantId: 'local-dev' }
  }

  // Prod placeholder. Production deployment is BLOCKED until Phase 5
  // replaces this body with real JWT verification against Entra (STACK.md
  // §5.5). The stub below accepts any bearer token so that infrastructure-
  // level smoke testing of /api/chat is possible without real Entra wiring
  // — it must not ship to customers.
  const auth = request.headers.get('authorization')
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return { error: 'unauthorized' }
  }
  // Stub: accept any bearer token, echo back a placeholder user.
  // Phase 5 replaces this with real JWT verification.
  return { sub: 'prod-stub', tenantId: 'prod-stub' }
}
