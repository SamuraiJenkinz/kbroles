import { SUGGESTED_PROMPTS } from '@/prompts/suggested'

/**
 * GET /api/prompts — static-ish chip list for the role selector on the chat
 * landing surface (handover §16; 02-CONTEXT.md §4.2).
 *
 * Runtime + cache contract (02-CONTEXT.md §4.2):
 *   - Node runtime (consistency with /api/chat; Edge is disallowed elsewhere
 *     for the NODE_EXTRA_CA_CERTS reason — no runtime split within the API).
 *   - `dynamic = 'force-dynamic'`: the response body keys on the `role` query
 *     parameter, and Next's force-static cache layer drops query strings at
 *     runtime (request.url loses ?role=...), which 400s every real request
 *     with role_required. Proxy caching is still achieved via the
 *     Cache-Control header below — shared caches key on full URL including
 *     query string, so consumer vs author responses stay distinct.
 *   - `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` lets
 *     a shared proxy hold the chips for 1h and propagate a redeploy within
 *     24h without re-fetching on every pageload. `Vary: Accept-Encoding`
 *     ensures gzip vs identity aren't cross-served.
 *
 * Role validation surface (02-CONTEXT.md §4.2):
 *   - Missing `role` query param → 400 {error:'role_required', allowed:[...]}
 *   - Unknown `role` value       → 400 {error:'role_invalid',  allowed:[...]}
 *   - Valid role (consumer|author) → 200 {role, prompts:[...]}
 *
 * This route is safe to ship before /api/chat because it doesn't touch the
 * upstream LLM — no Phase-0 smoke dependency. Plan 04 Task 4.1.
 */

import type { Role } from '@/grounding/rolePreludes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED: readonly Role[] = ['consumer', 'author'] as const

function isRole(value: string): value is Role {
  return value === 'consumer' || value === 'author'
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role')

  if (!role) {
    return Response.json(
      { error: 'role_required', allowed: ALLOWED },
      { status: 400 },
    )
  }

  if (!isRole(role)) {
    return Response.json(
      { error: 'role_invalid', allowed: ALLOWED },
      { status: 400 },
    )
  }

  return Response.json(
    { role, prompts: SUGGESTED_PROMPTS[role] },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        Vary: 'Accept-Encoding',
      },
    },
  )
}
