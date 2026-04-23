/**
 * formatRelative — relative timestamp formatter for CHAT-06 hover/focus timestamps.
 *
 * `at` and `now` are epoch milliseconds. Deterministic: no Date.now() call —
 * the caller passes both arguments so SSR + test environments get reproducible output.
 *
 * Wording is LOCKED per CONTEXT §Timestamps:
 *   "just now", "2m ago", "14:32 yesterday", DD MMM absolute.
 *
 * No Intl.RelativeTimeFormat — that API cannot produce "just now" for <60s cleanly.
 */

export function formatRelative(now: number, at: number): string {
  // Clamp: clock-skew edge where `at > now` renders 'just now', not a negative
  const deltaMs = Math.max(0, now - at)

  const SECOND = 1000
  const MINUTE = 60 * SECOND
  const HOUR   = 60 * MINUTE
  const DAY    = 24 * HOUR

  if (deltaMs < MINUTE) {
    return 'just now'
  }

  if (deltaMs < HOUR) {
    const m = Math.floor(deltaMs / MINUTE)
    return `${m}m ago`
  }

  if (deltaMs < DAY) {
    const h = Math.floor(deltaMs / HOUR)
    return `${h}h ago`
  }

  if (deltaMs < 2 * DAY) {
    // Yesterday — show HH:mm per CONTEXT §Timestamps ("14:32 yesterday")
    const d = new Date(at)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm} yesterday`
  }

  // Older — DD MMM
  return new Date(at).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}
