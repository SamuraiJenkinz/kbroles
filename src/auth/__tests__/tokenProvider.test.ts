/**
 * tokenProvider tests — host-aware silent/interactive token acquisition + signOut.
 *
 * Mocks getMsalInstance + detectHost so we can drive the decision tree without
 * real MSAL or Teams SDK. Verifies:
 *   1. Active account + silent succeeds → returns accessToken
 *   2. Silent throws InteractionRequiredAuthError + host='teams' → acquireTokenPopup
 *   3. Silent throws InteractionRequiredAuthError + host='browser' → acquireTokenRedirect
 *   4. No account + host='teams' → loginPopup
 *   5. signOut → logoutRedirect({postLogoutRedirectUri:'/'})
 *
 * Phase 5 — Plan 05-04 Task 1.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InteractionRequiredAuthError } from '@azure/msal-browser'

// Hoisted mocks so vi.mock factories can reference them safely.
const mocks = vi.hoisted(() => {
  return {
    getMsalInstance: vi.fn(),
    detectHost: vi.fn(),
  }
})

vi.mock('../msalInstance', () => ({
  getMsalInstance: mocks.getMsalInstance,
  __resetMsalForTests: vi.fn(),
}))

vi.mock('../detectHost', () => ({
  detectHost: mocks.detectHost,
  __resetDetectHostForTests: vi.fn(),
}))

import { acquireToken, signOut } from '../tokenProvider'

// Factory for a baseline MSAL-instance double — individual tests override.
function makeMsalDouble(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getActiveAccount: vi.fn().mockReturnValue(null),
    getAllAccounts: vi.fn().mockReturnValue([]),
    acquireTokenSilent: vi.fn(),
    acquireTokenPopup: vi.fn(),
    acquireTokenRedirect: vi.fn(),
    loginPopup: vi.fn(),
    loginRedirect: vi.fn(),
    logoutRedirect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

const TEST_ACCOUNT = {
  homeAccountId: 'home-id',
  environment: 'login.windows.net',
  tenantId: 'tenant-id',
  username: 'user@mmc.com',
  localAccountId: 'local-id',
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tokenProvider.acquireToken', () => {
  it('returns accessToken when silent acquisition succeeds for an active account', async () => {
    const msal = makeMsalDouble({
      getActiveAccount: vi.fn().mockReturnValue(TEST_ACCOUNT),
      acquireTokenSilent: vi.fn().mockResolvedValue({
        accessToken: 'silent-access-xyz',
        idToken: 'id-fallback',
      }),
    })
    mocks.getMsalInstance.mockResolvedValue(msal)
    mocks.detectHost.mockResolvedValue('browser')

    const token = await acquireToken()

    expect(token).toBe('silent-access-xyz')
    expect(msal.acquireTokenSilent).toHaveBeenCalledWith(
      expect.objectContaining({ account: TEST_ACCOUNT }),
    )
    // Interactive paths not invoked
    expect(msal.acquireTokenPopup).not.toHaveBeenCalled()
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
  })

  it('on InteractionRequiredAuthError + host=teams: uses acquireTokenPopup (NOT redirect)', async () => {
    const msal = makeMsalDouble({
      getActiveAccount: vi.fn().mockReturnValue(TEST_ACCOUNT),
      acquireTokenSilent: vi
        .fn()
        .mockRejectedValue(new InteractionRequiredAuthError('interaction_required', 'need UI')),
      acquireTokenPopup: vi.fn().mockResolvedValue({
        accessToken: 'popup-access-abc',
        idToken: 'id-fallback',
      }),
    })
    mocks.getMsalInstance.mockResolvedValue(msal)
    mocks.detectHost.mockResolvedValue('teams')

    const token = await acquireToken()

    expect(token).toBe('popup-access-abc')
    expect(msal.acquireTokenPopup).toHaveBeenCalledWith(
      expect.objectContaining({ account: TEST_ACCOUNT }),
    )
    // CRITICAL Anti-pattern guard: redirect MUST NOT be used in Teams
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
  })

  it('on InteractionRequiredAuthError + host=browser: uses acquireTokenRedirect', async () => {
    const msal = makeMsalDouble({
      getActiveAccount: vi.fn().mockReturnValue(TEST_ACCOUNT),
      acquireTokenSilent: vi
        .fn()
        .mockRejectedValue(new InteractionRequiredAuthError('interaction_required', 'need UI')),
      acquireTokenRedirect: vi.fn().mockResolvedValue(undefined),
    })
    mocks.getMsalInstance.mockResolvedValue(msal)
    mocks.detectHost.mockResolvedValue('browser')

    // acquireTokenRedirect navigates away; our wrapper throws 'unreachable' post-call.
    await expect(acquireToken()).rejects.toThrow(/unreachable/)

    expect(msal.acquireTokenRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ account: TEST_ACCOUNT }),
    )
    expect(msal.acquireTokenPopup).not.toHaveBeenCalled()
  })

  it('no account + host=teams: invokes loginPopup (NOT loginRedirect)', async () => {
    const msal = makeMsalDouble({
      getActiveAccount: vi.fn().mockReturnValue(null),
      getAllAccounts: vi.fn().mockReturnValue([]),
      loginPopup: vi.fn().mockResolvedValue({
        accessToken: 'login-popup-token',
        idToken: 'id-fallback',
      }),
    })
    mocks.getMsalInstance.mockResolvedValue(msal)
    mocks.detectHost.mockResolvedValue('teams')

    const token = await acquireToken(null)

    expect(token).toBe('login-popup-token')
    expect(msal.loginPopup).toHaveBeenCalledTimes(1)
    expect(msal.loginRedirect).not.toHaveBeenCalled()
    // Silent is skipped when no account exists
    expect(msal.acquireTokenSilent).not.toHaveBeenCalled()
  })
})

describe('tokenProvider.signOut', () => {
  it('calls logoutRedirect with postLogoutRedirectUri:"/"', async () => {
    const msal = makeMsalDouble()
    mocks.getMsalInstance.mockResolvedValue(msal)

    await signOut()

    expect(msal.logoutRedirect).toHaveBeenCalledTimes(1)
    expect(msal.logoutRedirect).toHaveBeenCalledWith({ postLogoutRedirectUri: '/' })
  })
})
