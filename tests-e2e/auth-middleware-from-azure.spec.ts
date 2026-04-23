import { test, expect } from '@playwright/test'

/**
 * Pitfall 11 remote smoke — exercises the deployed `/api/health` and
 * confirms `/api/chat` rejects an unauthenticated request with 401 from
 * the real Azure App Service (NOT just a localhost dev server).
 *
 * Runs against AZURE_WEBAPP_HOSTNAME when the env var is set; skips locally
 * so `pnpm test:e2e` on a developer laptop keeps passing without cloud creds.
 *
 * Phase 5 — Plan 05-05 Task 2.
 */
const HOSTNAME = process.env.AZURE_WEBAPP_HOSTNAME
const BASE = HOSTNAME ? `https://${HOSTNAME}` : null

test.describe('Pitfall 11 — auth middleware from Azure', () => {
  test.skip(!BASE, 'AZURE_WEBAPP_HOSTNAME not set — skipping remote smoke')

  test('GET /api/health returns 200 ok', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/health`)
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.status).toBe('ok')
  })

  test('POST /api/chat without Authorization returns 401', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/chat`, {
      data: { role: 'consumer', messages: [{ role: 'user', content: 'hi' }] },
      headers: { 'content-type': 'application/json' },
    })
    expect(resp.status()).toBe(401)
    const body = await resp.json()
    expect(body.error).toBe('unauthorized')
  })
})
