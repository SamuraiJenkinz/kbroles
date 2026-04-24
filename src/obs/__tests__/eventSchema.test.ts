/**
 * Unit tests for src/obs/eventSchema.ts
 *
 * These tests guard the event catalog against accidental regressions:
 *   - All names are snake_case and contain only alphanumeric + underscore characters.
 *   - No duplicate names (a duplicate would silently skew App Insights workbook counts).
 *   - The ROADMAP SC#1 required events are all present.
 *   - Each name satisfies the App Insights customEvent name constraints (≤512 chars).
 */
import { describe, it, expect } from 'vitest'
import { EVENT_NAMES } from '../eventSchema'
import type { EventName } from '../eventSchema'

// ─── Type proof (comment-only) ───────────────────────────────────────────────
//
// The TypeScript compiler rejects unknown event names at call sites. To verify:
//
//   // @ts-expect-error — 'not_a_valid_event' is not assignable to EventName
//   const _bad: EventName = 'not_a_valid_event'
//
// If you remove `@ts-expect-error`, tsc reports TS2322 at this line, confirming
// the type narrowing is working. This is the contract Plan 07 (workbook KQL)
// and Plan 03 (client events) depend on.
//
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _KnownEventUsed = EventName // referenced so the import is not unused

// =============================================================================
// Structure invariants
// =============================================================================

describe('EVENT_NAMES catalog', () => {
  it('contains no duplicate event names', () => {
    const seen = new Set<string>()
    for (const name of EVENT_NAMES) {
      expect(seen.has(name), `duplicate event name: "${name}"`).toBe(false)
      seen.add(name)
    }
  })

  it('every name is snake_case (alphanumeric + underscore only)', () => {
    for (const name of EVENT_NAMES) {
      expect(
        /^[a-z0-9_]+$/.test(name),
        `"${name}" contains characters outside [a-z0-9_]`,
      ).toBe(true)
    }
  })

  it('every name starts with a lowercase letter (not a digit or underscore)', () => {
    for (const name of EVENT_NAMES) {
      expect(
        /^[a-z]/.test(name),
        `"${name}" does not start with a lowercase letter`,
      ).toBe(true)
    }
  })

  it('every name is within the App Insights 512-char customEvent name limit', () => {
    for (const name of EVENT_NAMES) {
      expect(name.length, `"${name}" exceeds 512 chars`).toBeLessThanOrEqual(512)
    }
  })

  it('has exactly 15 entries (Plan 02 catalog size)', () => {
    expect(EVENT_NAMES.length).toBe(15)
  })
})

// =============================================================================
// ROADMAP SC#1 required events
// =============================================================================

describe('EVENT_NAMES roadmap SC#1 coverage', () => {
  // These are the events explicitly required by the ROADMAP success criterion #1.
  const sc1Required: string[] = [
    'session_start',
    'role_selected',
    'chip_vs_freeform',
    'question_hash',
    'citation_returned',
    'citation_click_through',
    'thumbs_rating',
    'fallback_trigger',
    'flag_a_gap_action',
  ]

  for (const name of sc1Required) {
    it(`contains required SC#1 event: "${name}"`, () => {
      expect(EVENT_NAMES as readonly string[]).toContain(name)
    })
  }
})
