/**
 * Host-aware token provider. Browser path: silent → redirect on interaction_required.
 * Teams path: silent → popup on interaction_required (RESEARCH open-question #2
 * correction — CONTEXT said redirect but Teams tabs are iframes and redirect
 * navigates the parent Teams window, not the tab).
 *
 * DEFAULT_SCOPES come from msalConfig so token TTL stays consistent. Caller
 * (useChatStream via ChatSurface DI) attaches the returned Bearer to /api/chat
 * requests.
 *
 * Phase 5 — Plan 05-04 Task 1.
 */
import type {
  AccountInfo,
  AuthenticationResult,
  IPublicClientApplication,
} from '@azure/msal-browser'
import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { getMsalInstance } from './msalInstance'
import { DEFAULT_SCOPES } from './msalConfig'
import { detectHost } from './detectHost'

export async function acquireToken(account?: AccountInfo | null): Promise<string> {
  const msal: IPublicClientApplication = await getMsalInstance()
  const activeAccount = account ?? msal.getActiveAccount() ?? msal.getAllAccounts()[0]

  if (!activeAccount) {
    // No account — force a sign-in via the host-appropriate interactive path.
    // loginRedirect navigates away (promise never resolves in-page); the
    // returned promise is for pre-redirect error handling only. In Teams we
    // use loginPopup because the tab is an iframe and redirect would navigate
    // the parent Teams window, not the tab.
    const host = await detectHost()
    if (host === 'teams') {
      const result: AuthenticationResult = await msal.loginPopup({
        scopes: [...DEFAULT_SCOPES],
      })
      return result.accessToken || result.idToken
    }
    await msal.loginRedirect({ scopes: [...DEFAULT_SCOPES] })
    throw new Error('unreachable — loginRedirect navigated away')
  }

  try {
    const result = await msal.acquireTokenSilent({
      account: activeAccount,
      scopes: [...DEFAULT_SCOPES],
    })
    return result.accessToken || result.idToken
  } catch (err) {
    // MSAL v5: check error.errorCode, NOT error.message (message is a URL hash).
    const isInteractionRequired =
      err instanceof InteractionRequiredAuthError ||
      (err as { errorCode?: string }).errorCode === 'interaction_required'

    if (!isInteractionRequired) throw err

    const host = await detectHost()
    if (host === 'teams') {
      const result = await msal.acquireTokenPopup({
        account: activeAccount,
        scopes: [...DEFAULT_SCOPES],
      })
      return result.accessToken || result.idToken
    }
    await msal.acquireTokenRedirect({ account: activeAccount, scopes: [...DEFAULT_SCOPES] })
    throw new Error('unreachable — acquireTokenRedirect navigated away')
  }
}

export async function signOut(): Promise<void> {
  const msal = await getMsalInstance()
  await msal.logoutRedirect({ postLogoutRedirectUri: '/' })
}
