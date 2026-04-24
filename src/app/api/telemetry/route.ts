/**
 * POST /api/telemetry — Phase 6 Plan 03.
 *
 * Generic client-event sink for events that are NOT thumb ratings.
 * Allowed event names are a closed enum — anything else returns 400.
 * PII-key defence strips known PII-bearing keys from the dimensions
 * record before emitting to trackEvent().
 *
 * Runtime: nodejs — iron-session uses Node crypto (Phase 5.1 Pitfall 1).
 *
 * Allowed events:
 *   - citation_click_through  (citation chip click → source_id, section_id)
 *   - flag_a_gap_action       (fallback card "Flag a gap" click → question_hash)
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/auth/session'
import { getSessionIdHash, getUserIdHash } from '@/auth/session'
import { trackEvent } from '@/obs/telemetry'
import { logger } from '@/obs/logger'
import type { SessionContext } from '@/obs/eventSchema'

export const runtime = 'nodejs'

// Keys that could carry PII — stripped as defence-in-depth against client bugs.
// MUST stay in sync with the PII boundary defined in eventSchema.ts §PII Boundaries.
const PII_KEYS = new Set(['email', 'upn', 'content', 'answer', 'quote', 'user'])

const ClientEventSchema = z.object({
  name: z.enum(['citation_click_through', 'flag_a_gap_action']),
  message_id: z.string().uuid(),
  dimensions: z.record(z.string(), z.string()).optional().default({}),
})

function filterPiiKeys(dims: Record<string, string>): Record<string, string> {
  const stripped: string[] = []
  const filtered: Record<string, string> = {}

  for (const [k, v] of Object.entries(dims)) {
    if (PII_KEYS.has(k)) {
      stripped.push(k)
    } else {
      filtered[k] = v
    }
  }

  if (stripped.length > 0) {
    logger.warn(
      { stripped_keys: stripped },
      '[api/telemetry] PII keys stripped from client dimensions',
    )
  }

  return filtered
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession()

  if (!session.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_payload', issues: ['body is not valid JSON'] }, { status: 400 })
  }

  const parsed = ClientEventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.issues.map(i => i.message) },
      { status: 400 },
    )
  }

  const { name, message_id, dimensions } = parsed.data

  const ctx: SessionContext = {
    session_id_hash: getSessionIdHash(session),
    user_id_hash: getUserIdHash(session),
    request_id: crypto.randomUUID(),
    role: session.user.roles?.includes('KbAssistant.Author') ? 'author' : 'consumer',
  }

  try {
    const filteredDimensions = filterPiiKeys(dimensions)

    trackEvent(name, {
      ...ctx,
      message_id,
      ...filteredDimensions,
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    trackEvent('ingress_error', { ...ctx, error_code: 'telemetry_handler_exception' })
    console.error('[api/telemetry] unhandled error', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
