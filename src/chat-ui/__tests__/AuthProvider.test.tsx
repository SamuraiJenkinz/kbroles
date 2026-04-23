// @vitest-environment jsdom
/**
 * Phase 5.1 — AuthProvider tests.
 *
 * 5 tests, one per status transition, asserting the xmcp-compatible state
 * shape returned by useAuth(). A minimal Consumer renders the context state
 * as data-attributes so each transition can be observed without wrapping
 * the consumer in additional layout markup.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthProvider'

// Minimal consumer that renders the current state as data-attributes.
function Consumer() {
  const { status, user, upn } = useAuth()
  return (
    <div
      data-testid="consumer"
      data-status={status}
      data-user={user ? user.email : ''}
      data-upn={upn ?? ''}
    />
  )
}

function fetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('initial status is loading BEFORE fetch resolves', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {}) as unknown as Promise<Response>,
    )
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )
    expect(screen.getByTestId('consumer').dataset.status).toBe('loading')
  })

  it('200 response → status:"authenticated" + user populated', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      fetchResponse({
        displayName: 'Alice',
        email: 'alice@mmc.com',
        oid: 'oid-1',
        roles: ['KbAssistant.User'],
      }),
    )
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('consumer').dataset.status).toBe('authenticated')
    })
    expect(screen.getByTestId('consumer').dataset.user).toBe('alice@mmc.com')
  })

  it('401 → status:"unauthenticated"', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      fetchResponse({ error: 'authentication_required' }, 401),
    )
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('consumer').dataset.status).toBe('unauthenticated')
    })
  })

  it('403 → status:"forbidden" + upn populated from body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      fetchResponse({ error: 'forbidden', upn: 'bob@mmc.com' }, 403),
    )
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('consumer').dataset.status).toBe('forbidden')
    })
    expect(screen.getByTestId('consumer').dataset.upn).toBe('bob@mmc.com')
  })

  it('network error → status:"error"', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('consumer').dataset.status).toBe('error')
    })
  })
})
