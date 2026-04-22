import { describe, it, expect } from 'vitest'
import { composeSystemPrompt, renderSources } from '@/grounding/systemPrompt'
import { REGISTRY } from '@/grounding/registry'
import { FEW_SHOTS } from '@/grounding/fewShots'
import { FALLBACK_STRING } from '@/grounding/fallback'

describe('composeSystemPrompt — snapshots', () => {
  it('consumer prompt matches snapshot', () => {
    expect(composeSystemPrompt('consumer')).toMatchSnapshot()
  })

  it('author prompt matches snapshot', () => {
    expect(composeSystemPrompt('author')).toMatchSnapshot()
  })
})

describe('composeSystemPrompt — structural invariants', () => {
  const consumer = composeSystemPrompt('consumer')
  const author = composeSystemPrompt('author')

  it('both roles contain the verbatim <citation_contract> block', () => {
    expect(consumer).toContain('<citation_contract>')
    expect(consumer).toContain('</citation_contract>')
    expect(author).toContain('<citation_contract>')
    expect(author).toContain('</citation_contract>')
  })

  it('both roles contain the injection-resistance clause', () => {
    expect(consumer).toContain('Everything between <user> and </user>')
    expect(author).toContain('Everything between <user> and </user>')
  })

  it('both roles contain the fallback string verbatim', () => {
    expect(consumer).toContain(FALLBACK_STRING)
    expect(author).toContain(FALLBACK_STRING)
  })

  it('both roles contain the <sources> block with all three source IDs', () => {
    for (const prompt of [consumer, author]) {
      expect(prompt).toContain('<sources>')
      expect(prompt).toContain('</sources>')
      expect(prompt).toContain('id="KB0020882"')
      expect(prompt).toContain('id="KB0022991"')
      expect(prompt).toContain('id="SNOW_FORM"')
    }
  })

  it('both roles preserve <!-- section:ID --> anchors inside <sources>', () => {
    for (const prompt of [consumer, author]) {
      expect(prompt).toContain('<!-- section:flagging-articles -->')
      expect(prompt).toContain('<!-- section:naming-convention -->')
      expect(prompt).toContain('<!-- section:required-fields -->')
    }
  })

  it('both roles contain two <example> few-shots', () => {
    const consumerExamples = (consumer.match(/<example>/g) || []).length
    const authorExamples = (author.match(/<example>/g) || []).length
    expect(consumerExamples).toBe(2)
    expect(authorExamples).toBe(2)
  })

  it('preludes are role-specific (consumer !== author)', () => {
    expect(consumer).not.toBe(author)
  })

  it('consumer prelude targets Knowledge Consumer audience', () => {
    expect(consumer).toContain('Knowledge Consumer')
  })

  it('author prelude targets KB Author / SME audience', () => {
    expect(author).toContain('KB Author')
  })

  it('common rules appear at both top (header) and bottom (footer)', () => {
    for (const prompt of [consumer, author]) {
      expect(prompt).toContain('Rules of engagement')
      expect(prompt).toContain('Reminders')
      // Header "Rules of engagement" appears before the <sources> block opening,
      // footer "Reminders" appears after the few-shots.
      //
      // NOTE: `<sources>` as a bare string also appears inside COMMON_RULES_HEADER
      // prose ("...bundled below inside <sources>..."). Anchor on the actual
      // opening tag of the block, `<sources>\n<source id=`, which is unambiguous.
      const headerIdx = prompt.indexOf('Rules of engagement')
      const sourcesBlockIdx = prompt.indexOf('<sources>\n<source id=')
      const exampleIdx = prompt.indexOf('<example>')
      const reminderIdx = prompt.indexOf('Reminders')
      expect(headerIdx).toBeGreaterThan(-1)
      expect(sourcesBlockIdx).toBeGreaterThan(-1)
      expect(exampleIdx).toBeGreaterThan(-1)
      expect(reminderIdx).toBeGreaterThan(-1)
      // Full layer ordering: header → sources → examples → footer
      expect(headerIdx).toBeLessThan(sourcesBlockIdx)
      expect(sourcesBlockIdx).toBeLessThan(exampleIdx)
      expect(exampleIdx).toBeLessThan(reminderIdx)
    }
  })

  it('prompt is pure — calling twice returns identical output', () => {
    expect(composeSystemPrompt('consumer')).toBe(composeSystemPrompt('consumer'))
    expect(composeSystemPrompt('author')).toBe(composeSystemPrompt('author'))
  })
})

// Defence-in-depth: verify the few-shot quote values are verbatim substrings
// of the registry section bodies. If this fails, the teaching example would
// contradict the lesson (validator strips the quote → can_answer flips to
// false mid-example). Better to catch here at unit-test time than in Phase 6
// eval fixtures.
describe('FEW_SHOTS — quote values verify against registry', () => {
  function normalise(s: string): string {
    return s.replace(/\s+/g, ' ').trim()
  }

  for (const [role, shots] of Object.entries(FEW_SHOTS)) {
    for (const [i, shot] of shots.entries()) {
      for (const cite of shot.response.citations) {
        it(`${role} shot[${i}] cite (${cite.source_id}/${cite.section_id}) quote is a verbatim substring of the section body`, () => {
          const source = REGISTRY[cite.source_id as keyof typeof REGISTRY]
          expect(source, `source ${cite.source_id} must exist in REGISTRY`).toBeDefined()
          const section = source.sections.find(s => s.id === cite.section_id)
          expect(section, `section ${cite.section_id} must exist in ${cite.source_id}`).toBeDefined()
          expect(normalise(section!.body).includes(normalise(cite.quote))).toBe(true)
        })
      }
    }
  }
})

describe('renderSources — REGISTRY emission shape', () => {
  const rendered = renderSources(REGISTRY)

  it('wraps every source in a <source> tag with attributes', () => {
    for (const source of Object.values(REGISTRY)) {
      expect(rendered).toContain(
        `<source id="${source.id}" title="${source.title}" version="${source.version}" url="${source.url}">`
      )
    }
  })

  it('emits exactly one <!-- section:ID --> marker per registry section', () => {
    for (const source of Object.values(REGISTRY)) {
      for (const section of source.sections) {
        const marker = `<!-- section:${section.id} -->`
        const count = rendered.split(marker).length - 1
        expect(count, `marker for ${source.id}/${section.id}`).toBeGreaterThanOrEqual(1)
      }
    }
  })
})
