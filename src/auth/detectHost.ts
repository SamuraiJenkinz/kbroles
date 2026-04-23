/**
 * Runtime host detection: are we embedded in a Microsoft Teams tab or
 * running in a plain browser?
 *
 * Detection is done via a Promise.race against a 150ms timeout. The key
 * insight (RESEARCH §Pitfall 2, GitHub teams-js issue #719): when run
 * outside Teams, `microsoftTeams.app.initialize()` NEVER resolves or
 * rejects — it just hangs. So the timeout is the only reliable discriminator.
 *
 * Result is memoised at module level so downstream callers (tokenProvider,
 * Header sign-out) don't re-race on every call.
 *
 * Phase 5 — Plan 05-01 Task 2.
 */
import * as microsoftTeams from '@microsoft/teams-js'

export type Host = 'teams' | 'browser'

const TIMEOUT_MS = 150 // CONTEXT.md "100-200ms — Claude's Discretion". 150ms is mid-range.

let _detected: Host | null = null
let _inflight: Promise<Host> | null = null

export function detectHost(): Promise<Host> {
  if (_detected) return Promise.resolve(_detected)
  if (_inflight) return _inflight

  _inflight = Promise.race<Host>([
    microsoftTeams.app
      .initialize()
      .then(() => 'teams' as const),
    new Promise<Host>((resolve) =>
      setTimeout(() => resolve('browser'), TIMEOUT_MS),
    ),
  ])
    .catch(() => 'browser' as const) // app.initialize() reject → not Teams
    .then((host) => {
      _detected = host
      _inflight = null
      return host
    })

  return _inflight
}

/** Test-only reset. Not exported from barrel; import via relative path in tests. */
export function __resetDetectHostForTests(): void {
  _detected = null
  _inflight = null
}
