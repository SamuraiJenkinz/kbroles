import { test, expect } from '@playwright/test'

/**
 * Pitfall 11 remote smoke — exercises the deployed `/api/health` and
 * confirms `/api/chat` rejects an unauthenticated request with 401 from
 * the real on-prem Windows deployment (NOT just a localhost dev server).
 *
 * Runs against the hostname env var when set; skips locally so
 * `pnpm test:e2e` on a developer laptop keeps passing without prod creds.
 *
 * Phase 5.1 — env var renamed to reflect the on-prem Windows deploy
 * target (Plan 07). The assertions themselves are unchanged —
 * /api/chat without session cookie still returns 401
 * {error:'unauthorized'} (Plan 04 middleware preserves the wire
 * contract).
 */
const HOSTNAME = process.env.APP_HOSTNAME
const BASE = HOSTNAME ? `https://${HOSTNAME}` : null

test.describe('Pitfall 11 — auth middleware from on-prem Windows', () => {
  test.skip(!BASE, 'APP_HOSTNAME not set — skipping remote smoke')

  test('GET /api/health returns 200 ok', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/health`)
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.status).toBe('ok')
  })

  test('POST /api/chat without session cookie returns 401', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/chat`, {
      data: { role: 'consumer', messages: [{ role: 'user', content: 'hi' }] },
      headers: { 'content-type': 'application/json' },
    })
    expect(resp.status()).toBe(401)
    const body = await resp.json()
    expect(body.error).toBe('unauthorized')
  })
})
