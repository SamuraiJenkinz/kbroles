import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GET } from '@/app/api/health/route'
import { __resetEnvCacheForTests } from '@/config/env'

/**
 * Route-level tests for GET /api/health — Plan 05-02 Task 1.
 *
 * Pattern mirrors /api/prompts/__tests__/route.test.ts (direct handler
 * invocation, no HTTP server). Four permutations of env × mgti → status code.
 *
 * global.fetch is replaced per-test to simulate MGTI reachability; the real
 * network is never touched.
 */

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = global.fetch

function makeHeadResponse(status: number): Response {
  // HEAD responses have no body — new Response(null, ...) is the canonical
  // shape. Cast via unknown because fetch's return type is wider than
  // Response (includes platform-specific fields in some lib.dom variants).
  return new Response(null, { status })
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
  process.env.LLM_AUTH_MODE = 'bearer'
  process.env.LLM_BASE_URL = 'https://api.openai.com/v1'
  process.env.LLM_API_KEY = 'sk-test'
  process.env.LLM_MODEL = 'gpt-4o'
  __resetEnvCacheForTests()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  global.fetch = ORIGINAL_FETCH
  __resetEnvCacheForTests()
  vi.restoreAllMocks()
})

describe('GET /api/health — env×mgti permutations', () => {
  it('env ok + MGTI HEAD returns 401 → 200 {status:"ok"} (401 < 500 = reachable)', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeHeadResponse(401))

    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; checks: { env: string; mgti: string } }
    expect(body.status).toBe('ok')
    expect(body.checks).toEqual({ env: 'ok', mgti: 'ok' })

    // Confirms the route issued a HEAD against LLM_BASE_URL (the only fetch
    // call in the happy path).
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1')
    expect((init as RequestInit).method).toBe('HEAD')
  })

  it('env ok + MGTI HEAD throws (network error) → 503 {status:"degraded", mgti:"fail"}', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('network error'))

    const res = await GET()
    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string; checks: { env: string; mgti: string } }
    expect(body.status).toBe('degraded')
    expect(body.checks).toEqual({ env: 'ok', mgti: 'fail' })
  })

  it('env ok + MGTI HEAD returns 502 → 503 {status:"degraded", mgti:"fail"} (502 >= 500)', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeHeadResponse(502))

    const res = await GET()
    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string; checks: { env: string; mgti: string } }
    expect(body.status).toBe('degraded')
    expect(body.checks.env).toBe('ok')
    expect(body.checks.mgti).toBe('fail')
  })

  it('env fails → 503 {status:"degraded", env:"fail"} and does NOT attempt the MGTI HEAD', async () => {
    // Blank LLM_BASE_URL fails z.string().url() — env() throws.
    process.env.LLM_BASE_URL = ''
    __resetEnvCacheForTests()
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy

    const res = await GET()
    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string; checks: { env: string; mgti: string } }
    expect(body.status).toBe('degraded')
    expect(body.checks.env).toBe('fail')
    // Short-circuits — no LLM_BASE_URL means no HEAD can be attempted.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sets Cache-Control: no-cache on every response (smoke target MUST NOT be cached)', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeHeadResponse(401))
    const ok = await GET()
    expect(ok.headers.get('cache-control')).toBe('no-cache, no-store, must-revalidate')

    global.fetch = vi.fn().mockResolvedValue(makeHeadResponse(502))
    const degraded = await GET()
    expect(degraded.headers.get('cache-control')).toBe('no-cache, no-store, must-revalidate')
  })

  it('Content-Type is application/json (from Response.json default)', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeHeadResponse(401))
    const res = await GET()
    expect((res.headers.get('content-type') ?? '').toLowerCase()).toContain('application/json')
  })
})
