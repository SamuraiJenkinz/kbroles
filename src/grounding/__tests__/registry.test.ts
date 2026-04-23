import { describe, it, expect } from 'vitest'
import { REGISTRY, parseSource } from '@/grounding/registry'

describe('REGISTRY — module load', () => {
  it('has all three sources keyed by SourceId', () => {
    expect(REGISTRY.KB0020882).toBeDefined()
    expect(REGISTRY.KB0022991).toBeDefined()
    expect(REGISTRY.SNOW_FORM).toBeDefined()
  })

  it('each source has the expected metadata', () => {
    expect(REGISTRY.KB0020882.version).toBe('9.0')
    expect(REGISTRY.KB0022991.version).toBe('13.0')
    // SNOW_FORM version was 'live'; changed to a dated string in Plan 04-01
    // so the freshness line can render 'Form schema YYYY-MM-DD' (TRST-01).
    expect(REGISTRY.SNOW_FORM.version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(REGISTRY.KB0020882.url).toContain('KB0020882')
    expect(REGISTRY.KB0022991.url).toContain('KB0022991')
  })

  it('each source has at least one section', () => {
    expect(REGISTRY.KB0020882.sections.length).toBeGreaterThan(0)
    expect(REGISTRY.KB0022991.sections.length).toBeGreaterThan(0)
    expect(REGISTRY.SNOW_FORM.sections.length).toBeGreaterThan(0)
  })

  it('KB0022991 has the flagging-articles section (load-bearing for fallback)', () => {
    const flagging = REGISTRY.KB0022991.sections.find(s => s.id === 'flagging-articles')
    expect(flagging).toBeDefined()
    expect(flagging!.body.length).toBeGreaterThan(10)
  })

  it('every section has a non-empty body and a title', () => {
    for (const source of Object.values(REGISTRY)) {
      for (const section of source.sections) {
        expect(section.id).toMatch(/^[\w-]+$/)
        expect(section.title.length).toBeGreaterThan(0)
        expect(section.body.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('parseSource — unit tests', () => {
  it('throws on missing <source> tag', () => {
    expect(() => parseSource('no tag here')).toThrow(/Missing or malformed/)
  })

  it('extracts a single section with kebab-case ID and ## heading title', () => {
    const raw = `<source id="KB0020882" title="Test" version="1.0" url="http://x">
<!-- section:example-section -->
## Example Section

Body text here.
</source>`
    const src = parseSource(raw)
    expect(src.id).toBe('KB0020882')
    expect(src.sections).toHaveLength(1)
    expect(src.sections[0].id).toBe('example-section')
    expect(src.sections[0].title).toBe('Example Section')
    expect(src.sections[0].body).toContain('Body text here')
  })

  it('extracts multiple sections correctly', () => {
    const raw = `<source id="KB0022991" title="T" version="1" url="http://x">
<!-- section:one -->
## One
Body one.
<!-- section:two -->
## Two
Body two.
</source>`
    const src = parseSource(raw)
    expect(src.sections).toHaveLength(2)
    expect(src.sections.map(s => s.id)).toEqual(['one', 'two'])
  })

  it('throws when source has zero section anchors', () => {
    const raw = `<source id="KB0020882" title="T" version="1" url="http://x">
## Heading with no anchor
Body.
</source>`
    expect(() => parseSource(raw)).toThrow(/no <!-- section:ID --> anchors/)
  })
})
