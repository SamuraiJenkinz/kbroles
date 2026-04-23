/**
 * GET /api/health — Phase-5 CI/CD canary smoke target (DELV-04).
 *
 * Returns 200 when env parses AND the MGTI base URL responds at all
 * (any status <500); 503 when either check fails.
 *
 * Deliberately does NOT authenticate — the GitHub Actions workflow
 * (Plan 05-05) hits this without an Entra token. It also does NOT hit
 * /api/chat because that would burn an MGTI token on every push to main
 * (CONTEXT §CI/CD pipeline — full /api/chat canary is Phase-6 nightly).
 *
 * MGTI HEAD check uses a 5s AbortController timeout. 401 is expected when
 * hitting LLM_BASE_URL without a token — it counts as reachable (status <500).
 *
 * Phase 5 — Plan 05-02 Task 1.
 */
import { env } from '@/config/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Check = 'ok' | 'fail'

export async function GET(): Promise<Response> {
  let envCheck: Check = 'fail'
  let mgtiCheck: Check = 'fail'
  let llmBaseUrl: string | null = null

  try {
    const parsed = env()
    envCheck = 'ok'
    llmBaseUrl = parsed.LLM_BASE_URL
  } catch {
    envCheck = 'fail'
  }

  if (llmBaseUrl) {
    try {
      const resp = await fetch(llmBaseUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5_000),
      })
      mgtiCheck = resp.status < 500 ? 'ok' : 'fail'
    } catch {
      mgtiCheck = 'fail'
    }
  }

  const allOk = envCheck === 'ok' && mgtiCheck === 'ok'
  return Response.json(
    {
      status: allOk ? 'ok' : 'degraded',
      checks: { env: envCheck, mgti: mgtiCheck },
    },
    {
      status: allOk ? 200 : 503,
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    },
  )
}
