/**
 * Route-level tests for GET /api/sources (Phase-4 client-safe source content surface).
 *
 * Pattern: direct handler calls with native Request objects (same pattern as
 * src/app/api/prompts/__tests__/route.test.ts). No supertest, no next/test-utils.
 */

import { describe, it, expect } from 'vitest'
import { GET, dynamic } from '@/app/api/sources/route'
import { REGISTRY } from '@/grounding/registry'

function makeRequest(url: string): Request {
  return new Request(url, { method: 'GET' })
}

describe('GET /api/sources — happy paths', () => {
  it('?source_id=KB0020882&section_id=resolution-field-software → 200 with non-empty body', async () => {
    const req = makeRequest(
      'https://example.test/api/sources?source_id=KB0020882&section_id=resolution-field-software',
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      source_id: string
      section_id: string
      title: string
      body: string
      url: string
      version: string
    }
    expect(body.source_id).toBe('KB0020882')
    expect(body.section_id).toBe('resolution-field-software')
    expect(body.title).toBe('Resolution Field — Software (11-point)')
    expect(body.body.length).toBeGreaterThan(0)
    expect(body.url).toBe(REGISTRY.KB0020882.url)
    expect(body.version).toBe(REGISTRY.KB0020882.version)
  })

  it('?source_id=KB0022991&section_id=flagging-articles → 200 with correct source metadata', async () => {
    const req = makeRequest(
      'https://example.test/api/sources?source_id=KB0022991&section_id=flagging-articles',
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { title: string; url: string; version: string }
    expect(body.title).toBe('Flagging Articles')
    expect(body.url).toBe(REGISTRY.KB0022991.url)
    expect(body.version).toBe(REGISTRY.KB0022991.version)
  })

  it('?source_id=SNOW_FORM&section_id=required-fields → 200 with version date (not "live")', async () => {
    const req = makeRequest(
      'https://example.test/api/sources?source_id=SNOW_FORM&section_id=required-fields',
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { version: string; body: string }
    // SNOW_FORM version must be a date (2026-04-23), not "live"
    expect(body.version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.body.length).toBeGreaterThan(0)
  })

  it('happy-path response carries Cache-Control + Vary headers', async () => {
    const req = makeRequest(
      'https://example.test/api/sources?source_id=KB0020882&section_id=who-can-submit',
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=3600, stale-while-revalidate=86400',
    )
    expect(res.headers.get('vary')).toBe('Accept-Encoding')
  })

  it('response Content-Type is application/json', async () => {
    const req = makeRequest(
      'https://example.test/api/sources?source_id=KB0020882&section_id=attachments',
    )
    const res = await GET(req)
    const ct = res.headers.get('content-type') ?? ''
    expect(ct.toLowerCase()).toContain('application/json')
  })

  it('route exports dynamic = "force-dynamic" (query-string keying)', () => {
    expect(dynamic).toBe('force-dynamic')
  })
})

describe('GET /api/sources — validation errors', () => {
  it('missing source_id → 400 {error:"missing_params"}', async () => {
    const req = makeRequest('https://example.test/api/sources?section_id=flagging-articles')
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('missing_params')
  })

  it('missing section_id → 400 {error:"missing_params"}', async () => {
    const req = makeRequest('https://example.test/api/sources?source_id=KB0022991')
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('missing_params')
  })

  it('both params missing → 400 {error:"missing_params"}', async () => {
    const req = makeRequest('https://example.test/api/sources')
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('missing_params')
  })

  it('unknown source_id → 404 {error:"unknown_source"}', async () => {
    const req = makeRequest(
      'https://example.test/api/sources?source_id=KB9999999&section_id=some-section',
    )
    const res = await GET(req)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string; allowed: string[] }
    expect(body.error).toBe('unknown_source')
    expect(Array.isArray(body.allowed)).toBe(true)
    expect(body.allowed).toContain('KB0020882')
  })

  it('known source_id but unknown section_id → 404 {error:"unknown_section"}', async () => {
    const req = makeRequest(
      'https://example.test/api/sources?source_id=KB0022991&section_id=nonexistent-section',
    )
    const res = await GET(req)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('unknown_section')
  })

  it('error responses do NOT carry the static Cache-Control (caching a 4xx would be a footgun)', async () => {
    const req = makeRequest('https://example.test/api/sources')
    const res = await GET(req)
    expect(res.status).toBe(400)
    expect(res.headers.get('cache-control')).toBeNull()
  })
})

describe('GET /api/sources — response shape contract', () => {
  it('200 response has {source_id, section_id, title, body, url, version} keys', async () => {
    const req = makeRequest(
      'https://example.test/api/sources?source_id=KB0020882&section_id=naming-convention',
    )
    const res = await GET(req)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toHaveProperty('source_id')
    expect(body).toHaveProperty('section_id')
    expect(body).toHaveProperty('title')
    expect(body).toHaveProperty('body')
    expect(body).toHaveProperty('url')
    expect(body).toHaveProperty('version')
  })

  it('body field contains non-empty markdown text from the corpus', async () => {
    const req = makeRequest(
      'https://example.test/api/sources?source_id=KB0020882&section_id=resolution-field-software',
    )
    const res = await GET(req)
    const body = (await res.json()) as { body: string }
    // Body must be non-empty markdown — at minimum a heading line
    expect(body.body).toContain('##')
    expect(body.body.length).toBeGreaterThan(50)
  })
})
