import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
import { createJWKSMock } from 'mock-jwks'
import { __resetEnvCacheForTests } from '@/config/env'
import { __resetJwksForTests, getRequestUser } from '../_middleware'

// --- Phase-5 Plan 05-03 Task 1: real JWT validator against a mocked JWKS --
//
// Pattern: mock-jwks v3.3.5 creates a local PKI + an MSW handler that
// intercepts requests to `${jwksBase}${jwksPath}` and returns the mock JWKS
// JSON. We use the two-argument form `createJWKSMock(base, path)` because
// Entra's JWKS path is `/discovery/v2.0/keys`, not the default
// `/.well-known/jwks.json` that the library would otherwise use.
//
// The returned `start()` thunk registers the MSW handler + returns a stop
// function for teardown. This is simpler than a custom setupServer() and
// avoids the transitive msw/node import that pnpm's hoisted linker doesn't
// surface at the top level.

const TENANT = '11111111-2222-3333-4444-555555555555'
const OTHER_TENANT = '99999999-8888-7777-6666-555555555555'
const CLIENT = '66666666-7777-8888-9999-aaaaaaaaaaaa'
const ISS = `https://login.microsoftonline.com/${TENANT}/v2.0`
// Note on URL shapes: mock-jwks resolves its handler URL via
// `new URL(jwksPath, jwksBase)`. A leading `/` in jwksPath triggers
// absolute-path semantics and REPLACES the tenant segment in jwksBase,
// resolving to `https://login.microsoftonline.com/discovery/v2.0/keys`
// instead of the tenant-scoped URL. We therefore (a) append a trailing
// `/` to the base so it parses as a directory, and (b) drop the leading
// `/` on the path so it appends correctly. The final intercepted URL
// matches exactly what `createRemoteJWKSet` hits in `_middleware.ts`.
const JWKS_BASE = `https://login.microsoftonline.com/${TENANT}/`
const JWKS_PATH = 'discovery/v2.0/keys'

const jwksMock = createJWKSMock(JWKS_BASE, JWKS_PATH)
let stopMock: (() => void) | null = null

beforeAll(() => {
  // Production gate so the dev-permissive path in _middleware.ts is disabled
  // for every test in this file. The final describe block re-stubs NODE_ENV
  // back to 'test' to exercise the permissive path explicitly.
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('ENTRA_CLIENT_ID', CLIENT)
  vi.stubEnv('ENTRA_TENANT_ID', TENANT)
  // env() loads the whole schema, so stub the LLM_* keys too — the
  // _middleware never reads them, but zod's safeParse rejects the unknown-
  // keys object wholesale if required fields are absent.
  vi.stubEnv('LLM_AUTH_MODE', 'bearer')
  vi.stubEnv('LLM_BASE_URL', 'https://api.openai.com/v1')
  vi.stubEnv('LLM_API_KEY', 'sk-test')
  vi.stubEnv('LLM_MODEL', 'gpt-4o')
  stopMock = jwksMock.start()
})

afterAll(() => {
  stopMock?.()
  vi.unstubAllEnvs()
})

beforeEach(() => {
  __resetEnvCacheForTests()
  __resetJwksForTests()
})

function makeRequest(authHeader?: string): Request {
  return new Request('https://example.test/api/chat', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

describe('getRequestUser — Entra JWT validator', () => {
  it('no Authorization header (prod) → { error: "unauthorized" }', async () => {
    const result = await getRequestUser(makeRequest())
    expect(result).toEqual({ error: 'unauthorized' })
  })

  it('malformed Authorization header (Basic scheme) → { error: "unauthorized" }', async () => {
    const result = await getRequestUser(makeRequest('Basic foo'))
    expect(result).toEqual({ error: 'unauthorized' })
  })

  it('Authorization header with empty bearer value → { error: "unauthorized" }', async () => {
    const result = await getRequestUser(makeRequest('Bearer   '))
    expect(result).toEqual({ error: 'unauthorized' })
  })

  it('valid JWT with correct tenant + audience → success with oid/tid/preferred_username', async () => {
    const token = jwksMock.token({
      iss: ISS,
      aud: CLIENT,
      tid: TENANT,
      oid: 'user-oid-xyz',
      preferred_username: 'alice@mmc.com',
    })
    const result = await getRequestUser(makeRequest(`Bearer ${token}`))
    expect(result).toEqual({
      sub: 'user-oid-xyz',
      tenantId: TENANT,
      preferredUsername: 'alice@mmc.com',
    })
  })

  it('expired JWT → { error: "token_expired" } (distinct from unauthorized)', async () => {
    // exp = now - 120s. clockTolerance is 60s so this is still >60s expired.
    const nowSec = Math.floor(Date.now() / 1000)
    const token = jwksMock.token({
      iss: ISS,
      aud: CLIENT,
      tid: TENANT,
      oid: 'user-oid-xyz',
      exp: nowSec - 120,
      iat: nowSec - 3600,
    })
    const result = await getRequestUser(makeRequest(`Bearer ${token}`))
    expect(result).toEqual({ error: 'token_expired' })
  })

  it('wrong audience (api://other-app) → { error: "unauthorized" } — Pitfall 4 guard', async () => {
    const token = jwksMock.token({
      iss: ISS,
      aud: 'api://something-else',
      tid: TENANT,
      oid: 'user-oid-xyz',
    })
    const result = await getRequestUser(makeRequest(`Bearer ${token}`))
    expect(result).toEqual({ error: 'unauthorized' })
  })

  it('issuer missing /v2.0 trailing → { error: "unauthorized" } — Pitfall 6 guard', async () => {
    const token = jwksMock.token({
      iss: `https://login.microsoftonline.com/${TENANT}`,  // v1 shape
      aud: CLIENT,
      tid: TENANT,
      oid: 'user-oid-xyz',
    })
    const result = await getRequestUser(makeRequest(`Bearer ${token}`))
    expect(result).toEqual({ error: 'unauthorized' })
  })

  it('wrong tenant (payload.tid = other GUID) → { error: "wrong_tenant" } — sole code-level gate', async () => {
    // Token is signed by the SAME mock JWKS (same tenant authority for
    // signature) but the payload claims the OTHER tenant — simulates the
    // allowlist-reject path that a real multi-tenant token forgery would
    // attempt. In production the signature-check runs BEFORE the tid check;
    // this test exercises the branch directly by using a matching iss+aud
    // so the signature + issuer + audience checks all pass, then the tid
    // mismatch fires.
    const token = jwksMock.token({
      iss: ISS,
      aud: CLIENT,
      tid: OTHER_TENANT,
      oid: 'user-oid-xyz',
    })
    const result = await getRequestUser(makeRequest(`Bearer ${token}`))
    expect(result).toEqual({ error: 'wrong_tenant' })
  })
})

describe('getRequestUser — dev permissive path (Phase 2/3/4 regression guard)', () => {
  beforeEach(() => {
    // Override the outer beforeAll's production stub so this describe block
    // exercises the dev-permissive branch. afterEach restores.
    vi.stubEnv('NODE_ENV', 'test')
    __resetEnvCacheForTests()
    __resetJwksForTests()
  })
  afterEach(() => {
    // Restore the prod stub for any subsequent tests.
    vi.stubEnv('NODE_ENV', 'production')
  })

  it('NODE_ENV=test + no Authorization header → { sub: "local-dev", tenantId: "local-dev" }', async () => {
    const result = await getRequestUser(makeRequest())
    expect(result).toEqual({ sub: 'local-dev', tenantId: 'local-dev' })
  })
})
