import { describe, it, expect } from 'vitest'
import { REGISTRY } from '@/grounding/registry'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

describe('Pitfall 19: section IDs are authored anchors, not heading slugs', () => {
  it('every section.id matches SECTION_RE kebab-case pattern', () => {
    for (const src of Object.values(REGISTRY)) {
      for (const s of src.sections) {
        // Anchor convention: kebab-case, starts with letter, ASCII only.
        // If this regex fails, likely someone derived the id from heading text.
        expect(s.id).toMatch(/^[a-z][a-z0-9-]*$/)
      }
    }
  })

  it('every section.id appears verbatim in its source file as <!-- section:ID -->', () => {
    // Reads the raw source files and asserts that for every registry section.id,
    // the file contains a `<!-- section:${id} -->` comment line. This proves the
    // parseSource regex extracted from authored markers rather than heading text.
    const files: Record<string, string> = {
      KB0020882: readFileSync(fileURLToPath(new URL('../sources/kb0020882.md', import.meta.url)), 'utf-8'),
      KB0022991: readFileSync(fileURLToPath(new URL('../sources/kb0022991.md', import.meta.url)), 'utf-8'),
      SNOW_FORM: readFileSync(fileURLToPath(new URL('../sources/servicenow-form.md', import.meta.url)), 'utf-8'),
    }
    for (const [srcId, src] of Object.entries(REGISTRY)) {
      const raw = files[srcId]
      for (const s of src.sections) {
        expect(raw).toContain(`<!-- section:${s.id} -->`)
      }
    }
  })

  it('section.title does NOT equal section.id (heading-slug drift guard)', () => {
    // If someone regressed parseSource to derive id from heading text, title
    // and id would collide on simple single-word headings. This asserts at
    // least one section per source has a distinct title vs id.
    for (const src of Object.values(REGISTRY)) {
      const distinct = src.sections.some(s => s.title.toLowerCase() !== s.id)
      expect(distinct).toBe(true)
    }
  })
})
