/**
 * sourceBadges.test.ts — canonical badge map + helper coverage.
 *
 * Pitfall 16 invariant: every SOURCE_BADGES entry must have colour + iconName + label.
 * Registry parity test: every (source_id, section_id) pair in REGISTRY has a
 * SOURCE_BADGES entry with a matching label (drift prevention at CI time).
 */

import { describe, it, expect } from 'vitest'
import {
  SOURCE_BADGES,
  SOURCE_FALLBACK,
  getSourceBadge,
  badgeClassesFor,
  ringClassesFor,
  type BadgeColour,
} from '../sourceBadges'
import { REGISTRY } from '@/grounding/registry'
import { resolveSourceTitle } from '../sourceTitles'

// ── Pitfall 16 invariant ───────────────────────────────────────────────────

describe('SOURCE_BADGES — Pitfall 16 invariant: every entry has colour + iconName + label', () => {
  it('has 22 entries covering all sections in the corpus', () => {
    expect(Object.keys(SOURCE_BADGES).length).toBe(22)
  })

  it('every entry has colour defined and is a valid BadgeColour', () => {
    const validColours: BadgeColour[] = ['blue', 'red', 'green', 'purple', 'amber']
    for (const [key, entry] of Object.entries(SOURCE_BADGES)) {
      expect(entry.colour, `${key}.colour must be defined`).toBeDefined()
      expect(validColours, `${key}.colour must be a valid BadgeColour`).toContain(entry.colour)
    }
  })

  it('every entry has iconName defined', () => {
    for (const [key, entry] of Object.entries(SOURCE_BADGES)) {
      expect(entry.iconName, `${key}.iconName must be defined`).toBeDefined()
      expect(typeof entry.iconName, `${key}.iconName must be a string`).toBe('string')
      expect(entry.iconName.length, `${key}.iconName must be non-empty`).toBeGreaterThan(0)
    }
  })

  it('every entry has label defined and non-empty', () => {
    for (const [key, entry] of Object.entries(SOURCE_BADGES)) {
      expect(entry.label, `${key}.label must be defined`).toBeDefined()
      expect(entry.label.length, `${key}.label must be non-empty`).toBeGreaterThan(0)
    }
  })
})

// ── Registry parity ────────────────────────────────────────────────────────

describe('SOURCE_BADGES — registry parity: every REGISTRY section has a SOURCE_BADGES entry', () => {
  it('every (source_id, section_id) pair in REGISTRY is covered by SOURCE_BADGES', () => {
    for (const [source_id, source] of Object.entries(REGISTRY)) {
      for (const section of source.sections) {
        const key = `${source_id}/${section.id}`
        expect(
          SOURCE_BADGES[key],
          `Missing SOURCE_BADGES entry for ${key} (title: "${section.title}")`,
        ).toBeDefined()
      }
    }
  })

  it('SOURCE_BADGES label matches REGISTRY section title for every covered pair', () => {
    for (const [source_id, source] of Object.entries(REGISTRY)) {
      for (const section of source.sections) {
        const badge = getSourceBadge(source_id, section.id)
        expect(
          badge.label,
          `Badge label mismatch for ${source_id}/${section.id}: badge="${badge.label}" registry="${section.title}"`,
        ).toBe(section.title)
      }
    }
  })

  it('covers all 22 corpus sections (6 KB0022991 + 9 KB0020882 + 7 SNOW_FORM)', () => {
    let total = 0
    for (const source of Object.values(REGISTRY)) {
      total += source.sections.length
    }
    expect(total).toBe(22)
    expect(Object.keys(SOURCE_BADGES).length).toBe(total)
  })
})

// ── Fallback behaviour ─────────────────────────────────────────────────────

describe('getSourceBadge — fallback behaviour', () => {
  it('returns amber/Tags fallback for KB0022991 with unknown section_id', () => {
    const badge = getSourceBadge('KB0022991', 'nonexistent-section')
    expect(badge.colour).toBe('amber')
    expect(badge.iconName).toBe('Tags')
    expect(badge.label).toBe('nonexistent-section') // raw id as label
  })

  it('returns blue/FileText fallback for KB0020882 with unknown section_id', () => {
    const badge = getSourceBadge('KB0020882', 'nonexistent-section')
    expect(badge.colour).toBe('blue')
    expect(badge.iconName).toBe('FileText')
    expect(badge.label).toBe('nonexistent-section')
  })

  it('returns purple/ClipboardList fallback for SNOW_FORM with unknown section_id', () => {
    const badge = getSourceBadge('SNOW_FORM', 'mystery-field')
    expect(badge.colour).toBe('purple')
    expect(badge.iconName).toBe('ClipboardList')
    expect(badge.label).toBe('mystery-field')
  })

  it('returns amber/FileText for completely unknown source_id (LLM hallucination guard)', () => {
    const badge = getSourceBadge('UNKNOWN_SOURCE', 'any-section')
    expect(badge.colour).toBe('amber')
    expect(badge.iconName).toBe('FileText')
    expect(badge.label).toBe('any-section')
  })
})

// ── Exact badge values for key section pairs ───────────────────────────────

describe('getSourceBadge — exact badge values for representative pairs', () => {
  it('KB0022991/flagging-articles → red / Flag', () => {
    const badge = getSourceBadge('KB0022991', 'flagging-articles')
    expect(badge.colour).toBe('red')
    expect(badge.iconName).toBe('Flag')
    expect(badge.label).toBe('Flagging Articles')
  })

  it('KB0022991/publishing-approval → green / Upload', () => {
    const badge = getSourceBadge('KB0022991', 'publishing-approval')
    expect(badge.colour).toBe('green')
    expect(badge.iconName).toBe('Upload')
  })

  it('KB0020882/resolution-field-software → blue / FileText', () => {
    const badge = getSourceBadge('KB0020882', 'resolution-field-software')
    expect(badge.colour).toBe('blue')
    expect(badge.iconName).toBe('FileText')
    expect(badge.label).toBe('Resolution Field — Software (11-point)')
  })

  it('KB0020882/attachments → blue / Paperclip (source-level override, not purple)', () => {
    const badge = getSourceBadge('KB0020882', 'attachments')
    expect(badge.colour).toBe('blue')
    expect(badge.iconName).toBe('Paperclip')
  })

  it('KB0020882/categorisation → amber / Tags', () => {
    const badge = getSourceBadge('KB0020882', 'categorisation')
    expect(badge.colour).toBe('amber')
    expect(badge.iconName).toBe('Tags')
  })

  it('SNOW_FORM/required-fields → purple / ClipboardList', () => {
    const badge = getSourceBadge('SNOW_FORM', 'required-fields')
    expect(badge.colour).toBe('purple')
    expect(badge.iconName).toBe('ClipboardList')
    expect(badge.label).toBe('Required Fields')
  })
})

// ── SOURCE_FALLBACK ────────────────────────────────────────────────────────

describe('SOURCE_FALLBACK', () => {
  it('has entries for all three source_ids', () => {
    expect(SOURCE_FALLBACK['KB0020882']).toBeDefined()
    expect(SOURCE_FALLBACK['KB0022991']).toBeDefined()
    expect(SOURCE_FALLBACK['SNOW_FORM']).toBeDefined()
  })

  it('KB0020882 fallback is blue/FileText', () => {
    expect(SOURCE_FALLBACK['KB0020882'].colour).toBe('blue')
    expect(SOURCE_FALLBACK['KB0020882'].iconName).toBe('FileText')
  })

  it('KB0022991 fallback is amber/Tags (default for uncovered sections)', () => {
    expect(SOURCE_FALLBACK['KB0022991'].colour).toBe('amber')
    expect(SOURCE_FALLBACK['KB0022991'].iconName).toBe('Tags')
  })

  it('SNOW_FORM fallback is purple/ClipboardList', () => {
    expect(SOURCE_FALLBACK['SNOW_FORM'].colour).toBe('purple')
    expect(SOURCE_FALLBACK['SNOW_FORM'].iconName).toBe('ClipboardList')
  })
})

// ── Tailwind class helpers ─────────────────────────────────────────────────

describe('badgeClassesFor + ringClassesFor', () => {
  const colours: BadgeColour[] = ['blue', 'red', 'green', 'purple', 'amber']

  it('badgeClassesFor returns a non-empty string for every colour', () => {
    for (const c of colours) {
      const cls = badgeClassesFor(c)
      expect(typeof cls).toBe('string')
      expect(cls.length).toBeGreaterThan(0)
    }
  })

  it('ringClassesFor returns a non-empty string containing "ring-2" for every colour', () => {
    for (const c of colours) {
      const cls = ringClassesFor(c)
      expect(cls).toContain('ring-2')
    }
  })

  it('badgeClassesFor(blue) contains bg-blue-50', () => {
    expect(badgeClassesFor('blue')).toContain('bg-blue-50')
  })

  it('badgeClassesFor(amber) contains bg-amber-50', () => {
    expect(badgeClassesFor('amber')).toContain('bg-amber-50')
  })

  it('ringClassesFor(red) contains ring-red-500', () => {
    expect(ringClassesFor('red')).toContain('ring-red-500')
  })
})

// ── resolveSourceTitle parity ──────────────────────────────────────────────

describe('resolveSourceTitle parity — every REGISTRY section_id resolves to a non-undefined title', () => {
  it('every section_id in REGISTRY returns a defined title via resolveSourceTitle', () => {
    for (const [source_id, source] of Object.entries(REGISTRY)) {
      for (const section of source.sections) {
        const title = resolveSourceTitle(section.id)
        expect(
          title,
          `resolveSourceTitle('${section.id}') from ${source_id} returned undefined`,
        ).toBeDefined()
      }
    }
  })
})
