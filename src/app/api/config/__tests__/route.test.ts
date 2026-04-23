/**
 * Route-level tests for GET /api/config (Phase-4 trust/freshness data surface).
 *
 * Pattern: direct handler calls with native Request objects (same pattern as
 * src/app/api/prompts/__tests__/route.test.ts). No supertest, no next/test-utils.
 *
 * Env isolation: the route calls env() which requires LLM_* vars. We mock
 * @/config/env to return a controlled Env object — same approach used in
 * the chat route tests for streamAnswer (vi.mock + controlled return values).
 */

import { describe, it, expect, vi } from 'vitest'
import { REGISTRY } from '@/grounding/registry'

// Mock env() to return a controlled value — avoids requiring real LLM_* vars
// in the test environment. The route only reads CONTENT_STEWARD_EMAIL from env().
vi.mock('@/config/env', () => ({
  env: () => ({
    CONTENT_STEWARD_EMAIL: 'kb-knowledge-team@mmc.com',
    // Include required LLM_* fields for schema completeness (not read by config route)
    LLM_AUTH_MODE: 'bearer',
    LLM_BASE_URL: 'https://api.openai.com/v1',
    LLM_API_KEY: 'test-key',
    LLM_MODEL: 'gpt-4o',
    STRICT_SCHEMA_SUPPORTED: 'true',
    MAX_INFLIGHT_STREAMS: 20,
    MAX_MESSAGES: 20,
    MAX_MESSAGE_CHARS: 8000,
    UPSTREAM_TOTAL_TIMEOUT_MS: 45000,
    UPSTREAM_RETRY_MAX: 2,
    UPSTREAM_RETRY_BASE_MS: 500,
    UPSTREAM_RETRY_JITTER_MS: 250,
  }),
  __resetEnvCacheForTests: vi.fn(),
}))

import { GET, dynamic } from '@/app/api/config/route'

describe('GET /api/config — happy path', () => {
  it('returns 200 with {versions, contentStewardEmail}', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      versions: { KB0022991: string; KB0020882: string; SNOW_FORM: string }
      contentStewardEmail: string
    }
    expect(body.versions).toBeDefined()
    expect(body.contentStewardEmail).toBeDefined()
  })

  it('versions.KB0022991 matches REGISTRY.KB0022991.version', async () => {
    const res = await GET()
    const body = (await res.json()) as { versions: Record<string, string> }
    expect(body.versions.KB0022991).toBe(REGISTRY.KB0022991.version)
  })

  it('versions.KB0020882 matches REGISTRY.KB0020882.version', async () => {
    const res = await GET()
    const body = (await res.json()) as { versions: Record<string, string> }
    expect(body.versions.KB0020882).toBe(REGISTRY.KB0020882.version)
  })

  it('versions.SNOW_FORM is a dated version (YYYY-MM-DD), NOT "live"', async () => {
    const res = await GET()
    const body = (await res.json()) as { versions: Record<string, string> }
    expect(body.versions.SNOW_FORM).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.versions.SNOW_FORM).not.toBe('live')
  })

  it('response carries Cache-Control + Vary headers', async () => {
    const res = await GET()
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=3600, stale-while-revalidate=86400',
    )
    expect(res.headers.get('vary')).toBe('Accept-Encoding')
  })

  it('response Content-Type is application/json', async () => {
    const res = await GET()
    const ct = res.headers.get('content-type') ?? ''
    expect(ct.toLowerCase()).toContain('application/json')
  })

  it('route exports dynamic = "force-dynamic"', () => {
    expect(dynamic).toBe('force-dynamic')
  })
})

describe('GET /api/config — CONTENT_STEWARD_EMAIL', () => {
  it('contentStewardEmail is the mocked value from env() (default: kb-knowledge-team@mmc.com)', async () => {
    const res = await GET()
    const body = (await res.json()) as { contentStewardEmail: string }
    expect(body.contentStewardEmail).toBe('kb-knowledge-team@mmc.com')
  })

  it('contentStewardEmail contains an @ sign', async () => {
    const res = await GET()
    const body = (await res.json()) as { contentStewardEmail: string }
    expect(body.contentStewardEmail).toContain('@')
  })
})

describe('GET /api/config — versions object shape', () => {
  it('versions object has exactly the three expected keys', async () => {
    const res = await GET()
    const body = (await res.json()) as { versions: Record<string, unknown> }
    const keys = Object.keys(body.versions)
    expect(keys).toContain('KB0022991')
    expect(keys).toContain('KB0020882')
    expect(keys).toContain('SNOW_FORM')
    expect(keys.length).toBe(3)
  })

  it('all version values are non-empty strings', async () => {
    const res = await GET()
    const body = (await res.json()) as { versions: Record<string, unknown> }
    for (const [key, val] of Object.entries(body.versions)) {
      expect(typeof val, `versions.${key} must be a string`).toBe('string')
      expect((val as string).length, `versions.${key} must be non-empty`).toBeGreaterThan(0)
    }
  })
})
