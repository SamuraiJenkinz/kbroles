import { describe, it, expect } from 'vitest'
import { SUGGESTED_PROMPTS } from '@/prompts/suggested'

describe('SUGGESTED_PROMPTS — counts + shape', () => {
  it('has exactly 5 consumer chips and 8 author chips', () => {
    expect(SUGGESTED_PROMPTS.consumer).toHaveLength(5)
    expect(SUGGESTED_PROMPTS.author).toHaveLength(8)
  })

  it('consumer IDs match /^cns-0\\d$/', () => {
    for (const chip of SUGGESTED_PROMPTS.consumer) {
      expect(chip.id).toMatch(/^cns-0\d$/)
    }
  })

  it('author IDs match /^auth-0\\d$/', () => {
    for (const chip of SUGGESTED_PROMPTS.author) {
      expect(chip.id).toMatch(/^auth-0\d$/)
    }
  })

  it('every chip has non-empty label + text', () => {
    const all = [...SUGGESTED_PROMPTS.consumer, ...SUGGESTED_PROMPTS.author]
    for (const chip of all) {
      expect(chip.label.length).toBeGreaterThan(0)
      expect(chip.text.length).toBeGreaterThan(0)
    }
  })

  it('all 13 IDs are unique across both roles (telemetry invariant)', () => {
    const allIds = [
      ...SUGGESTED_PROMPTS.consumer.map(c => c.id),
      ...SUGGESTED_PROMPTS.author.map(c => c.id),
    ]
    expect(allIds).toHaveLength(13)
    expect(new Set(allIds).size).toBe(13)
  })
})

describe('SUGGESTED_PROMPTS — verbatim-from-handover drift detector', () => {
  // These word sets are the "topic anchors" for handover §16's 5 Consumer +
  // 8 Author questions. If anyone paraphrases a chip into synonyms, one of
  // these anchor words will disappear — the test catches the drift without
  // demanding an exact string match that would be tedious to maintain.
  const CONSUMER_ANCHORS = ['flag', 'edit', 'find', 'link', 'categories']
  const AUTHOR_ANCHORS = [
    'fields', 'naming', 'Resolution', 'attachments', 'submit', 'retire', 'comms', 'SME',
  ]

  it('every consumer topic anchor appears at least once across consumer labels', () => {
    const haystack = SUGGESTED_PROMPTS.consumer.map(c => c.label).join(' | ')
    for (const anchor of CONSUMER_ANCHORS) {
      expect(haystack, `consumer anchor "${anchor}" missing`).toContain(anchor)
    }
  })

  it('every author topic anchor appears at least once across author labels', () => {
    const haystack = SUGGESTED_PROMPTS.author.map(c => c.label).join(' | ')
    for (const anchor of AUTHOR_ANCHORS) {
      expect(haystack, `author anchor "${anchor}" missing`).toContain(anchor)
    }
  })
})

describe('SUGGESTED_PROMPTS — v1 label/text parity', () => {
  // In v1 every chip's label and text are identical (every handover §16
  // question is already UI-sized). This test documents that invariant; the
  // shape supports divergence in future phases if a UI-brevity tradeoff
  // surfaces. If this test fails after an edit, confirm the divergence is
  // intentional, update this test, and note the change in the commit.
  it('label === text for every chip in v1', () => {
    const all = [...SUGGESTED_PROMPTS.consumer, ...SUGGESTED_PROMPTS.author]
    for (const chip of all) {
      expect(chip.label).toBe(chip.text)
    }
  })
})
