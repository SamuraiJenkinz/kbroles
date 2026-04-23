/**
 * GET /api/sources?source_id=X&section_id=Y
 *
 * Phase-4 client-safe source content surface. The REGISTRY module reads
 * files synchronously at init (server-only). The Source Panel (Plan 02)
 * fetches section bodies via this route instead of importing REGISTRY.
 *
 * Contract:
 *   - Missing source_id | section_id → 400 {error:'missing_params'}
 *   - Unknown source_id              → 404 {error:'unknown_source'}
 *   - Unknown section_id             → 404 {error:'unknown_section'}
 *   - Valid pair                     → 200 {source_id, section_id, title, body, url, version}
 *
 * Caching: public, max-age=3600 (sources change on redeploy only — safe to
 * cache on shared proxy for an hour).
 *
 * Runtime + cache contract mirrors /api/prompts (force-dynamic for query-string
 * keying; Cache-Control for shared proxy caching). See 02-CONTEXT.md §4.2.
 */

import { REGISTRY } from '@/grounding/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_SOURCES = ['KB0020882', 'KB0022991', 'SNOW_FORM'] as const
type AllowedSource = (typeof ALLOWED_SOURCES)[number]

function isAllowedSource(value: string): value is AllowedSource {
  return ALLOWED_SOURCES.includes(value as AllowedSource)
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const source_id = searchParams.get('source_id')
  const section_id = searchParams.get('section_id')

  if (!source_id || !section_id) {
    return Response.json({ error: 'missing_params' }, { status: 400 })
  }

  if (!isAllowedSource(source_id)) {
    return Response.json(
      { error: 'unknown_source', allowed: ALLOWED_SOURCES },
      { status: 404 },
    )
  }

  const src = REGISTRY[source_id]
  const section = src.sections.find(s => s.id === section_id)
  if (!section) {
    return Response.json({ error: 'unknown_section' }, { status: 404 })
  }

  return Response.json(
    {
      source_id,
      section_id,
      title: section.title,
      body: section.body,
      url: src.url,
      version: src.version,
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
