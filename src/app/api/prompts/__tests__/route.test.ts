import { describe, it, expect } from 'vitest'
import { GET, dynamic } from '@/app/api/prompts/route'
import { SUGGESTED_PROMPTS } from '@/prompts/suggested'

/**
 * Route-level tests for GET /api/prompts (per 02-RESEARCH §Vitest Route-Level
 * Testing Pattern): call the handler with a native Request object, assert
 * against the returned Response. No HTTP server, no Next.js runtime — the
 * handler is a pure async function so this pattern is sufficient.
 */

function makeRequest(url: string): Request {
  return new Request(url, { method: 'GET' })
}

describe('GET /api/prompts — happy paths', () => {
  it('?role=consumer → 200 with 5 consumer chips', async () => {
    const req = makeRequest('https://example.test/api/prompts?role=consumer')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { role: string; prompts: unknown[] }
    expect(body.role).toBe('consumer')
    expect(Array.isArray(body.prompts)).toBe(true)
    expect(body.prompts).toHaveLength(5)
    // Body identity — the chip list is verbatim from SUGGESTED_PROMPTS.
    expect(body.prompts).toEqual(SUGGESTED_PROMPTS.consumer)
  })

  it('?role=author → 200 with 8 author chips', async () => {
    const req = makeRequest('https://example.test/api/prompts?role=author')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { role: string; prompts: unknown[] }
    expect(body.role).toBe('author')
    expect(body.prompts).toHaveLength(8)
    expect(body.prompts).toEqual(SUGGESTED_PROMPTS.author)
  })

  it('response Content-Type is application/json (from Response.json default)', async () => {
    const req = makeRequest('https://example.test/api/prompts?role=consumer')
    const res = await GET(req)
    const ct = res.headers.get('content-type') ?? ''
    expect(ct.toLowerCase()).toContain('application/json')
  })

  it('happy-path response carries the locked Cache-Control + Vary headers', async () => {
    const req = makeRequest('https://example.test/api/prompts?role=consumer')
    const res = await GET(req)
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=3600, stale-while-revalidate=86400',
    )
    expect(res.headers.get('vary')).toBe('Accept-Encoding')
  })

  // Drift guard: force-static drops the query string at runtime (request.url
  // loses ?role=...), which 400s every real request with role_required. The
  // route MUST stay force-dynamic; proxy caching is still achieved via the
  // Cache-Control header above.
  it('route exports dynamic = "force-dynamic" (force-static strips query params at runtime)', () => {
    expect(dynamic).toBe('force-dynamic')
  })
})

describe('GET /api/prompts — validation errors', () => {
  it('no role query param → 400 {error:"role_required", allowed:[...]}', async () => {
    const req = makeRequest('https://example.test/api/prompts')
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; allowed: string[] }
    expect(body.error).toBe('role_required')
    expect(body.allowed).toEqual(['consumer', 'author'])
  })

  it('unknown role → 400 {error:"role_invalid", allowed:[...]}', async () => {
    const req = makeRequest('https://example.test/api/prompts?role=admin')
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; allowed: string[] }
    expect(body.error).toBe('role_invalid')
    expect(body.allowed).toEqual(['consumer', 'author'])
  })

  it('empty role value (?role=) → 400 role_required (empty string treated as missing)', async () => {
    const req = makeRequest('https://example.test/api/prompts?role=')
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    // Per URL semantics, `?role=` yields '' which the `!role` guard catches
    // before the enum check — so the error is role_required, not role_invalid.
    expect(body.error).toBe('role_required')
  })

  it('error responses do NOT carry the static Cache-Control (caching a 400 would be a footgun)', async () => {
    const req = makeRequest('https://example.test/api/prompts?role=nobody')
    const res = await GET(req)
    expect(res.status).toBe(400)
    // Response.json() doesn't set Cache-Control by default, and we only set
    // it on the 200 path. Proxies receive no cache directive and treat the
    // error as uncacheable by default.
    expect(res.headers.get('cache-control')).toBeNull()
  })
})

describe('chip item shape (defensive — ensures /api/prompts response matches the doc contract)', () => {
  it('each consumer chip has {id, label, text} with id stable across wording changes', async () => {
    const req = makeRequest('https://example.test/api/prompts?role=consumer')
    const res = await GET(req)
    const body = (await res.json()) as { prompts: Array<{ id: string; label: string; text: string }> }
    for (const chip of body.prompts) {
      expect(typeof chip.id).toBe('string')
      expect(chip.id.length).toBeGreaterThan(0)
      expect(typeof chip.label).toBe('string')
      expect(typeof chip.text).toBe('string')
    }
    // IDs are the stable identifier for Phase 6 telemetry.
    const ids = body.prompts.map(p => p.id)
    expect(ids).toEqual(['cns-01', 'cns-02', 'cns-03', 'cns-04', 'cns-05'])
  })

  it('each author chip has {id, label, text}; IDs auth-01..auth-08', async () => {
    const req = makeRequest('https://example.test/api/prompts?role=author')
    const res = await GET(req)
    const body = (await res.json()) as { prompts: Array<{ id: string; label: string; text: string }> }
    const ids = body.prompts.map(p => p.id)
    expect(ids).toEqual([
      'auth-01', 'auth-02', 'auth-03', 'auth-04',
      'auth-05', 'auth-06', 'auth-07', 'auth-08',
    ])
  })
})
