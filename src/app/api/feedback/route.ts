/**
 * POST /api/feedback — Phase 6 Plan 03.
 *
 * Receives 👍/👎 feedback payloads from the client (AssistantControls),
 * validates them with Zod, checks the iron-session for authentication,
 * and forwards to trackEvent('thumbs_rating', ...).
 *
 * Runtime: nodejs — iron-session uses Node crypto.createCipheriv which is
 * unsupported on Edge Runtime (Phase 5.1 Pitfall 1).
 *
 * SLA: < 200 ms server-side processing. trackEvent() is synchronous — no
 * await needed (span.end() schedules async export without blocking).
 *
 * FDBK-03: { message_id, role, rating, citation_source_id, citation_section_id, reason }
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/auth/session'
import { getSessionIdHash, getUserIdHash } from '@/auth/session'
import { trackEvent } from '@/obs/telemetry'
import type { SessionContext } from '@/obs/eventSchema'

export const runtime = 'nodejs'

const FeedbackSchema = z.object({
  message_id: z.string().uuid(),
  rating: z.enum(['up', 'down']),
  reason: z.enum(['hallucinated', 'wrong citation', 'incomplete', 'other']).optional(),
  citation_source_id: z.string().optional(),
  citation_section_id: z.string().optional(),
})

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

  const parsed = FeedbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.issues.map(i => i.message) },
      { status: 400 },
    )
  }

  const { message_id, rating, reason, citation_source_id, citation_section_id } = parsed.data

  const ctx: SessionContext = {
    session_id_hash: getSessionIdHash(session),
    user_id_hash: getUserIdHash(session),
    request_id: crypto.randomUUID(),
    role: session.user.roles?.includes('KbAssistant.Author') ? 'author' : 'consumer',
  }

  try {
    trackEvent('thumbs_rating', {
      ...ctx,
      message_id,
      rating,
      reason,
      citation_source_id,
      citation_section_id,
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    const errCtx: SessionContext = {
      session_id_hash: ctx.session_id_hash,
      user_id_hash: ctx.user_id_hash,
      request_id: ctx.request_id,
      role: ctx.role,
    }
    trackEvent('ingress_error', { ...errCtx, error_code: 'feedback_handler_exception' })
    console.error('[api/feedback] unhandled error', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
