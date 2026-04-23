/**
 * formatRelative tests — deterministic node env assertions.
 * All tests use fixed epoch values to avoid CI timezone sensitivity.
 *
 * Fixed base: 1714435200000 = 2024-04-30 00:00:00 UTC
 */

import { describe, it, expect } from 'vitest'
import { formatRelative } from '../time'

const BASE = 1714435200000 // 2024-04-30 00:00:00 UTC

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR   = 60 * MINUTE
const DAY    = 24 * HOUR

describe('formatRelative', () => {
  // ─── "just now" (<60s) ──────────────────────────────────────────────────

  it('returns "just now" when at === now (zero delta)', () => {
    expect(formatRelative(BASE, BASE)).toBe('just now')
  })

  it('returns "just now" for 30 seconds ago', () => {
    expect(formatRelative(BASE, BASE - 30 * SECOND)).toBe('just now')
  })

  it('returns "just now" for 59,999 ms ago (boundary: one ms before threshold)', () => {
    expect(formatRelative(BASE, BASE - 59_999)).toBe('just now')
  })

  // ─── "Nm ago" (1m–59m) ──────────────────────────────────────────────────

  it('returns "1m ago" for exactly 60,000 ms ago (boundary: first minute)', () => {
    expect(formatRelative(BASE, BASE - 60_000)).toBe('1m ago')
  })

  it('returns "2m ago" for 120,000 ms ago', () => {
    expect(formatRelative(BASE, BASE - 120_000)).toBe('2m ago')
  })

  it('returns "59m ago" for 59 minutes ago', () => {
    expect(formatRelative(BASE, BASE - 59 * MINUTE)).toBe('59m ago')
  })

  // ─── "Nh ago" (1h–23h) ──────────────────────────────────────────────────

  it('returns "1h ago" for exactly 60 minutes ago (boundary: first hour)', () => {
    expect(formatRelative(BASE, BASE - 60 * MINUTE)).toBe('1h ago')
  })

  it('returns "5h ago" for 5 hours ago', () => {
    expect(formatRelative(BASE, BASE - 5 * HOUR)).toBe('5h ago')
  })

  it('returns "23h ago" for 23 hours ago', () => {
    expect(formatRelative(BASE, BASE - 23 * HOUR)).toBe('23h ago')
  })

  // ─── "HH:mm yesterday" (24h–48h) ────────────────────────────────────────

  it('returns a HH:mm yesterday string for 25 hours ago', () => {
    const result = formatRelative(BASE, BASE - 25 * HOUR)
    expect(result).toMatch(/^\d{2}:\d{2} yesterday$/)
  })

  it('returns a HH:mm yesterday string for exactly 24 hours ago (boundary)', () => {
    const result = formatRelative(BASE, BASE - 24 * HOUR)
    expect(result).toMatch(/^\d{2}:\d{2} yesterday$/)
  })

  // ─── "DD MMM" (≥48h) ────────────────────────────────────────────────────

  it('returns a date string with a day number and 3-letter month abbreviation for 3 days ago', () => {
    const result = formatRelative(BASE, BASE - 3 * DAY)
    // Accept either "DD MMM" (en-GB) or "MMM DD" (en-US) locale formats —
    // toLocaleDateString(undefined, ...) is locale-sensitive across environments.
    // The invariant is: contains a 1-2 digit number AND a 3-letter month abbreviation.
    expect(result).toMatch(/\d{1,2}/)           // has a day number
    expect(result).toMatch(/[A-Z][a-z]{2}/)     // has a 3-letter month abbreviation
    expect(result.length).toBeLessThan(12)       // is compact (no full date strings)
  })

  // ─── Clock-skew edge ─────────────────────────────────────────────────────

  it('returns "just now" when at > now (clock skew clamps delta to 0)', () => {
    expect(formatRelative(1000, 2000)).toBe('just now')
  })
})
