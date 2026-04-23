/**
 * sourceTitles tests — node env, no jsdom needed.
 *
 * Validates the Phase-3 minimum seed entries and graceful degradation
 * for unknown section_ids (UTIL-01 copy-suffix fallback).
 */

import { describe, it, expect } from 'vitest'
import { resolveSourceTitle, SOURCE_TITLES } from '../sourceTitles'

describe('resolveSourceTitle', () => {
  it('resolves "flagging-articles" → "Flagging Articles"', () => {
    expect(resolveSourceTitle('flagging-articles')).toBe('Flagging Articles')
  })

  it('resolves "resolution" → "Resolution"', () => {
    expect(resolveSourceTitle('resolution')).toBe('Resolution')
  })

  it('returns undefined for an unknown section_id (graceful degradation)', () => {
    expect(resolveSourceTitle('unknown-section')).toBeUndefined()
  })

  it('returns undefined for an empty string', () => {
    expect(resolveSourceTitle('')).toBeUndefined()
  })
})

describe('SOURCE_TITLES', () => {
  it('has at least 8 entries (Phase-3 minimum seed)', () => {
    expect(Object.keys(SOURCE_TITLES).length).toBeGreaterThanOrEqual(8)
  })

  it('every value starts with an uppercase letter (title-case sanity check)', () => {
    for (const [key, value] of Object.entries(SOURCE_TITLES)) {
      expect(value, `Entry "${key}" should start with uppercase`).toMatch(/^[A-Z]/)
    }
  })

  it('includes both consumer-facing and author-facing section ids', () => {
    // Consumer (KB0022991)
    expect(SOURCE_TITLES['flagging-articles']).toBeDefined()
    // Author (KB0020882)
    expect(SOURCE_TITLES['approvers']).toBeDefined()
    // SNOW_FORM
    expect(SOURCE_TITLES['form-fields']).toBeDefined()
  })
})
