import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('detectHost', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns 'teams' when microsoftTeams.app.initialize() resolves", async () => {
    vi.doMock('@microsoft/teams-js', () => ({
      app: { initialize: () => Promise.resolve() },
    }))
    const { detectHost } = await import('../detectHost')
    await expect(detectHost()).resolves.toBe('teams')
  })

  it("returns 'browser' when initialize() never resolves within 150ms", async () => {
    vi.doMock('@microsoft/teams-js', () => ({
      app: { initialize: () => new Promise(() => {}) }, // never resolves
    }))
    const { detectHost } = await import('../detectHost')
    await expect(detectHost()).resolves.toBe('browser')
  })

  it("returns 'browser' when initialize() rejects (e.g. ChannelError)", async () => {
    vi.doMock('@microsoft/teams-js', () => ({
      app: { initialize: () => Promise.reject(new Error('no host')) },
    }))
    const { detectHost } = await import('../detectHost')
    await expect(detectHost()).resolves.toBe('browser')
  })

  it('memoises the result across repeat calls', async () => {
    const initialize = vi.fn(() => Promise.resolve())
    vi.doMock('@microsoft/teams-js', () => ({ app: { initialize } }))
    const { detectHost } = await import('../detectHost')
    await detectHost()
    await detectHost()
    await detectHost()
    expect(initialize).toHaveBeenCalledTimes(1)
  })
})
