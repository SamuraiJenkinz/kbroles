import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mutable state so each test can reconfigure what SecretsManager returns
// WITHOUT re-declaring the vi.mock() (which is hoisted and would otherwise
// require vi.doMock + dynamic re-imports).
//
// sendImpl is called by the mocked client.send() — tests reassign it to
// either resolve (success / empty-string) or reject (AWS failure). Tracking
// call count lets us assert the module-level cache is honoured.
//
// simulateSdkMissing=true causes the factory-returned module to throw when
// its named exports are accessed — same shape as "Cannot find module", but
// achievable without vi.resetModules() (which would kill the mock binding
// for subsequent tests).
let sendImpl: () => Promise<unknown> = () =>
  Promise.resolve({ SecretString: '{}' })
let sendCallCount = 0
let simulateSdkMissing = false

vi.mock('@aws-sdk/client-secrets-manager', () => {
  return {
    get SecretsManagerClient() {
      if (simulateSdkMissing) {
        throw new Error("Cannot find module '@aws-sdk/client-secrets-manager'")
      }
      return vi.fn().mockImplementation(() => ({
        send: vi.fn().mockImplementation(() => {
          sendCallCount++
          return sendImpl()
        }),
      }))
    },
    get GetSecretValueCommand() {
      if (simulateSdkMissing) {
        throw new Error("Cannot find module '@aws-sdk/client-secrets-manager'")
      }
      return vi.fn().mockImplementation((input: unknown) => ({ input }))
    },
  }
})

// Import UNDER TEST after mock is registered.
import { loadSecrets, __resetSecretsCacheForTests } from '../secrets'

describe('loadSecrets', () => {
  // Keys we test — must be snapshotted + restored so test pollution does not
  // leak into sibling suites (the env test file, session tests, etc).
  const SNAPSHOT_KEYS = [
    'SESSION_SECRET',
    'ENTRA_CLIENT_ID',
    'ENTRA_CLIENT_SECRET',
    'ENTRA_TENANT_ID',
    'LLM_API_KEY',
    'LLM_BASE_URL',
    'AWS_SECRET_NAME',
    'AWS_REGION',
  ]
  const envSnapshot = new Map<string, string | undefined>()

  beforeEach(() => {
    __resetSecretsCacheForTests()
    sendCallCount = 0
    simulateSdkMissing = false
    // Default: success with empty JSON (tests can override).
    sendImpl = () => Promise.resolve({ SecretString: '{}' })
    // Snapshot + clear so defaults don't contaminate assertions.
    envSnapshot.clear()
    for (const key of SNAPSHOT_KEYS) {
      envSnapshot.set(key, process.env[key])
      delete process.env[key]
    }
  })

  afterEach(() => {
    __resetSecretsCacheForTests()
    // Restore snapshot exactly as it was.
    for (const key of SNAPSHOT_KEYS) {
      const original = envSnapshot.get(key)
      if (original === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = original
      }
    }
  })

  it('caches the result module-level: second call does NOT invoke send() again', async () => {
    sendImpl = () =>
      Promise.resolve({
        SecretString: JSON.stringify({
          SESSION_SECRET: 'cached-secret-32-chars-aaaaaaaaaa',
        }),
      })

    const first = await loadSecrets()
    const second = await loadSecrets()

    expect(first).toEqual(second)
    expect(sendCallCount).toBe(1) // second call short-circuited by _cache
  })

  it('writes AWS secrets into process.env when the key is NOT already set', async () => {
    sendImpl = () =>
      Promise.resolve({
        SecretString: JSON.stringify({
          SESSION_SECRET: 'real-secret-32-chars-aaaaaaaaaaaa',
          ENTRA_CLIENT_ID: 'real-client',
        }),
      })

    const merged = await loadSecrets()

    expect(process.env.SESSION_SECRET).toBe('real-secret-32-chars-aaaaaaaaaaaa')
    expect(process.env.ENTRA_CLIENT_ID).toBe('real-client')
    expect(merged.SESSION_SECRET).toBe('real-secret-32-chars-aaaaaaaaaaaa')
    expect(merged.ENTRA_CLIENT_ID).toBe('real-client')
  })

  it('dev wins over AWS: pre-set process.env values are NOT overwritten', async () => {
    process.env.SESSION_SECRET = 'dev-override-xxxxxxxxxxxxxxxxxxxxxxxx'

    sendImpl = () =>
      Promise.resolve({
        SecretString: JSON.stringify({
          SESSION_SECRET: 'aws-would-be-here-yyyyyyyyyyyyyyyyyy',
          ENTRA_CLIENT_ID: 'aws-client-id',
        }),
      })

    await loadSecrets()

    // SESSION_SECRET kept its pre-existing dev value
    expect(process.env.SESSION_SECRET).toBe(
      'dev-override-xxxxxxxxxxxxxxxxxxxxxxxx',
    )
    // ENTRA_CLIENT_ID was unset → AWS value wins
    expect(process.env.ENTRA_CLIENT_ID).toBe('aws-client-id')
  })

  it('returns {} and does NOT throw when AWS send() rejects', async () => {
    sendImpl = () =>
      Promise.reject(new Error('AWS_NOT_REACHABLE: credentials missing'))

    const result = await loadSecrets()

    expect(result).toEqual({})
    // process.env untouched
    expect(process.env.SESSION_SECRET).toBeUndefined()
  })

  it('returns {} when SecretString is empty (missing payload)', async () => {
    sendImpl = () => Promise.resolve({ SecretString: undefined })

    const result = await loadSecrets()

    expect(result).toEqual({})
    expect(process.env.SESSION_SECRET).toBeUndefined()
  })

  it('returns {} and does NOT throw when SDK import fails at runtime', async () => {
    // Trip the getter-throws flag so the destructured import inside
    // loadSecrets() throws the same "Cannot find module" error that would
    // occur if the SDK package were genuinely absent. No vi.resetModules()
    // needed — the factory's getters re-evaluate per-access.
    simulateSdkMissing = true

    const result = await loadSecrets()

    expect(result).toEqual({})
    expect(process.env.SESSION_SECRET).toBeUndefined()
  })

  it('handles malformed JSON in SecretString without throwing', async () => {
    sendImpl = () =>
      Promise.resolve({ SecretString: 'not-valid-json{{{' })

    const result = await loadSecrets()

    expect(result).toEqual({})
  })
})
