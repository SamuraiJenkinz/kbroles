// @vitest-environment jsdom
/**
 * Unit tests for src/lib/telemetryClient.ts
 *
 * Tests the sendBeacon primary path, fetch fallback path, throw-swallow, and
 * JSON serialisation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendFeedback, sendClientEvent } from '../telemetryClient'

const VALID_UUID = '00000000-0000-4000-8000-000000000099'

describe('sendFeedback', () => {
  let originalSendBeacon: typeof navigator.sendBeacon
  const originalFetch = global.fetch

  beforeEach(() => {
    originalSendBeacon = navigator.sendBeacon
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    navigator.sendBeacon = originalSendBeacon
    vi.restoreAllMocks()
    global.fetch = originalFetch
  })

  it('calls navigator.sendBeacon with the correct URL and Blob type', async () => {
    const beaconSpy = vi.fn().mockReturnValue(true)
    navigator.sendBeacon = beaconSpy

    await sendFeedback({ message_id: VALID_UUID, rating: 'up' })

    expect(beaconSpy).toHaveBeenCalledOnce()
    const [url, blob] = beaconSpy.mock.calls[0] as [string, Blob]
    expect(url).toBe('/api/feedback')
    expect(blob.type).toBe('application/json')
  })

  it('body JSON-serialises rating: down exactly', async () => {
    const beaconSpy = vi.fn().mockReturnValue(true)
    navigator.sendBeacon = beaconSpy

    await sendFeedback({ message_id: VALID_UUID, rating: 'down', reason: 'other' })

    const [, blob] = beaconSpy.mock.calls[0] as [string, Blob]
    const text = await blob.text()
    const parsed = JSON.parse(text) as { message_id: string; rating: string; reason: string }
    expect(parsed.rating).toBe('down')
    expect(parsed.reason).toBe('other')
    expect(parsed.message_id).toBe(VALID_UUID)
  })

  it('falls back to fetch with keepalive when sendBeacon returns false', async () => {
    const beaconSpy = vi.fn().mockReturnValue(false)
    navigator.sendBeacon = beaconSpy

    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    global.fetch = fetchSpy

    await sendFeedback({ message_id: VALID_UUID, rating: 'up' })

    expect(beaconSpy).toHaveBeenCalledOnce()
    expect(fetchSpy).toHaveBeenCalledOnce()
    const fetchInit = fetchSpy.mock.calls[0][1] as RequestInit
    expect(fetchInit.keepalive).toBe(true)
    expect(fetchInit.credentials).toBe('include')
    expect(fetchInit.method).toBe('POST')
  })

  it('falls back to fetch when navigator.sendBeacon is unavailable', async () => {
    // Simulate Node environment (no sendBeacon)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(navigator as any).sendBeacon = undefined

    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    global.fetch = fetchSpy

    await sendFeedback({ message_id: VALID_UUID, rating: 'down' })

    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('swallows fetch rejection — does NOT throw out to the caller', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(navigator as any).sendBeacon = undefined
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network error'))
    global.fetch = fetchSpy

    // Must not throw
    await expect(sendFeedback({ message_id: VALID_UUID, rating: 'up' })).resolves.toBeUndefined()

    // console.warn should have been called
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('sendClientEvent', () => {
  let originalSendBeacon: typeof navigator.sendBeacon
  const originalFetch = global.fetch

  beforeEach(() => {
    originalSendBeacon = navigator.sendBeacon
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    navigator.sendBeacon = originalSendBeacon
    vi.restoreAllMocks()
    global.fetch = originalFetch
  })

  it('calls navigator.sendBeacon with /api/telemetry and application/json Blob', async () => {
    const beaconSpy = vi.fn().mockReturnValue(true)
    navigator.sendBeacon = beaconSpy

    await sendClientEvent('citation_click_through', VALID_UUID, { source_id: 'KB0022991' })

    expect(beaconSpy).toHaveBeenCalledOnce()
    const [url, blob] = beaconSpy.mock.calls[0] as [string, Blob]
    expect(url).toBe('/api/telemetry')
    expect(blob.type).toBe('application/json')

    const text = await blob.text()
    const parsed = JSON.parse(text) as { name: string; message_id: string; dimensions: Record<string, string> }
    expect(parsed.name).toBe('citation_click_through')
    expect(parsed.message_id).toBe(VALID_UUID)
    expect(parsed.dimensions.source_id).toBe('KB0022991')
  })

  it('falls back to fetch with keepalive when sendBeacon returns false', async () => {
    const beaconSpy = vi.fn().mockReturnValue(false)
    navigator.sendBeacon = beaconSpy

    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    global.fetch = fetchSpy

    await sendClientEvent('flag_a_gap_action', VALID_UUID, { question_hash: 'abc' })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(init.keepalive).toBe(true)
  })

  it('swallows thrown error and calls console.warn', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(navigator as any).sendBeacon = undefined
    const fetchSpy = vi.fn().mockRejectedValue(new Error('dead'))
    global.fetch = fetchSpy

    await expect(
      sendClientEvent('flag_a_gap_action', VALID_UUID),
    ).resolves.toBeUndefined()

    expect(console.warn).toHaveBeenCalled()
  })
})
