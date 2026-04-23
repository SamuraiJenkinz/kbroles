/**
 * GET /api/config — Phase-4 trust/freshness data + non-secret UI constants.
 *
 * Returns:
 *   - versions: REGISTRY source versions (for TRST-01 freshness line in Header)
 *   - contentStewardEmail: recipient for FBK-04 mailto (non-secret, non-NEXT_PUBLIC
 *     because it is sourced via this endpoint, not baked into the client bundle)
 *
 * Sourced server-side from REGISTRY + env(). Same runtime + cache pattern
 * as /api/prompts (02-CONTEXT.md §4.2).
 *
 * REGISTRY is server-only (readFileSync at init) — cannot be imported in client
 * components. This route bridges the gap (RESEARCH §Anti-Patterns: do NOT import
 * REGISTRY in client components).
 */

import { REGISTRY } from '@/grounding/registry'
import { env } from '@/config/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  return Response.json(
    {
      versions: {
        KB0022991: REGISTRY.KB0022991.version,
        KB0020882: REGISTRY.KB0020882.version,
        SNOW_FORM:  REGISTRY.SNOW_FORM.version,
      },
      contentStewardEmail: env().CONTENT_STEWARD_EMAIL,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        Vary: 'Accept-Encoding',
      },
    },
  )
}
