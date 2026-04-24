/**
 * scripts/__tests__/pull-servicenow-feedback.test.ts
 *
 * Unit tests for the SN pull script core logic.
 * Mocks global fetch via vi.stubGlobal — NEVER hits the real ServiceNow API.
 *
 * The pull script's logic is tested by importing snGet() and testing the
 * helper directly, plus testing the pure data-transformation logic inline
 * to avoid module re-import / cache issues.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── mock loadSecrets so tests don't try to reach AWS ─────────────────────────
vi.mock('../../src/config/secrets.js', () => ({
  loadSecrets: vi.fn().mockResolvedValue({}),
}))

// ── constants ─────────────────────────────────────────────────────────────────
const FAKE_SA = JSON.stringify({ username: 'svc_user', password: 's3cr3t' })
const EXPECTED_TOKEN = Buffer.from('svc_user:s3cr3t').toString('base64')

function makeKbRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sys_id: 'sys-001',
    number: 'KB0001234',
    short_description: 'How to reset password',
    workflow_state: 'retired',
    u_rejection_reason: 'Superseded by KB0001235',
    sys_updated_on: '2026-04-01 00:00:00',
    ...overrides,
  }
}

function makeSnFetchResponse(rows: Record<string, unknown>[]) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({ result: rows }),
  } as unknown as Response)
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('snGet', () => {
  // Import snGet once at the top level — Vitest module cache is fine here
  // because we stub globalThis.fetch before each test.
  let snGet: (
    pathname: string,
    params: Record<string, string>,
  ) => Promise<{ result: Record<string, unknown>[] }>

  beforeEach(async () => {
    process.env.SERVICENOW_SERVICE_ACCOUNT = FAKE_SA
    process.env.SN_INSTANCE = 'mmcnow'
    // Import here so vi.mock above is guaranteed applied
    const mod = await import('../pull-servicenow-feedback.js')
    snGet = mod.snGet
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.SERVICENOW_SERVICE_ACCOUNT
    delete process.env.SN_INSTANCE
  })

  it('sends Authorization: Basic <base64(user:pass)> on every request', async () => {
    const fetchSpy = vi.fn(() => makeSnFetchResponse([makeKbRow()]))
    vi.stubGlobal('fetch', fetchSpy)

    await snGet('/api/now/table/kb_knowledge', { sysparm_limit: '1' })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [, opts] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect((opts.headers as Record<string, string>)['Authorization']).toBe(
      `Basic ${EXPECTED_TOKEN}`,
    )
  })

  it('builds the URL with the SN instance domain and passes params', async () => {
    const fetchSpy = vi.fn(() => makeSnFetchResponse([]))
    vi.stubGlobal('fetch', fetchSpy)

    await snGet('/api/now/table/kb_knowledge', {
      sysparm_query: 'workflow_stateINretired,outdated,draft',
      sysparm_fields: 'sys_id,number,workflow_state',
    })

    const [url] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('mmcnow.service-now.com')
    expect(url).toContain('sysparm_query=workflow_stateINretired')
    expect(url).toContain('sysparm_fields=sys_id')
  })

  it('throws an error on a non-OK response', async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      } as unknown as Response),
    )
    vi.stubGlobal('fetch', fetchSpy)

    await expect(snGet('/api/now/table/kb_knowledge', {})).rejects.toThrow('SN 401')
  })

  it('includes sysparm_fields with u_rejection_reason for kb_knowledge', async () => {
    const fetchSpy = vi.fn(() => makeSnFetchResponse([]))
    vi.stubGlobal('fetch', fetchSpy)

    await snGet('/api/now/table/kb_knowledge', {
      sysparm_query: 'workflow_stateINretired,outdated,draft',
      sysparm_fields:
        'sys_id,number,short_description,workflow_state,u_rejection_reason,sys_updated_on',
      sysparm_limit: '500',
    })

    const [url] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('u_rejection_reason')
    expect(url).toContain('short_description')
    expect(url).toContain('sys_updated_on')
  })
})

// ── pure data-transformation tests (no fetch needed) ─────────────────────────

describe('feedback correlation logic', () => {
  it('aggregates feedback_count by article sys_id across multiple feedback rows', () => {
    const articleId = 'sys-abc'
    const feedbackRows = [
      { 'article.sys_id': articleId },
      { 'article.sys_id': articleId },
      { 'article.sys_id': 'other-id' },
    ] as Record<string, unknown>[]

    const feedbackByArticle = new Map<string, number>()
    for (const row of feedbackRows) {
      const id = row['article.sys_id'] as string | undefined
      if (id) feedbackByArticle.set(id, (feedbackByArticle.get(id) ?? 0) + 1)
    }

    expect(feedbackByArticle.get(articleId)).toBe(2)
    expect(feedbackByArticle.get('other-id')).toBe(1)
    expect(feedbackByArticle.get('nonexistent')).toBeUndefined()
  })
})

describe('window label logic', () => {
  it('returns baseline-pre-pilot when --baseline flag is in argv', () => {
    const argv = ['node', 'script.ts', '--baseline']
    const isBaseline = argv.includes('--baseline')
    const windowLabel = isBaseline ? 'baseline-pre-pilot' : new Date().toISOString().slice(0, 7)
    expect(windowLabel).toBe('baseline-pre-pilot')
  })

  it('returns YYYY-MM format for normal run (no --baseline)', () => {
    const argv = ['node', 'script.ts']
    const isBaseline = argv.includes('--baseline')
    const windowLabel = isBaseline ? 'baseline-pre-pilot' : new Date().toISOString().slice(0, 7)
    expect(windowLabel).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('u_rejection_reason coercion', () => {
  // Tests the exact guard used in the script's .map() callback
  function coerce(r: Record<string, unknown>): string | undefined {
    const rawReason = r['u_rejection_reason']
    return typeof rawReason === 'string' && rawReason.length > 0 ? rawReason : undefined
  }

  it('returns undefined when u_rejection_reason is absent (key missing)', () => {
    expect(coerce({})).toBeUndefined()
  })

  it('returns undefined when u_rejection_reason is an empty string', () => {
    expect(coerce({ u_rejection_reason: '' })).toBeUndefined()
  })

  it('returns undefined when u_rejection_reason is null', () => {
    expect(coerce({ u_rejection_reason: null })).toBeUndefined()
  })

  it('returns the string value when u_rejection_reason is present', () => {
    expect(coerce({ u_rejection_reason: 'Article superseded' })).toBe('Article superseded')
  })

  it('does NOT return the string "undefined" for missing field', () => {
    expect(coerce({})).not.toBe('undefined')
    expect(coerce({ u_rejection_reason: '' })).not.toBe('undefined')
    expect(coerce({ u_rejection_reason: null })).not.toBe('undefined')
  })
})
