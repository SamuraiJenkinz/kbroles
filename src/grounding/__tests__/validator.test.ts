import { describe, it, expect } from 'vitest'
import { validateCitations } from '@/grounding/validator'
import type { Registry } from '@/grounding/registry'
import type { KbResponse } from '@/grounding/schema'
import { FALLBACK_STRING } from '@/grounding/fallback'

// Minimal fixture registry — keep bodies small and verbatim-testable.
// Inline fixtures (not the real REGISTRY) per RESEARCH.md Gap 1:
// "Inject the registry as a parameter" — enables isolated test branches.
const FIXTURE: Registry = {
  KB0020882: {
    id: 'KB0020882',
    title: 'Submit New/Update Technical Knowledge Article SOP',
    version: '9.0',
    url: 'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0020882',
    sections: [
      {
        id: 'naming-convention',
        title: 'Article Naming Convention',
        body: 'Titles must follow the four-part format: [Application] - [Type] - [OPCO] - [Region], limited to 160 characters total.',
      },
    ],
  },
  KB0022991: {
    id: 'KB0022991',
    title: 'Technical Knowledge Base Article Management SOP',
    version: '13.0',
    url: 'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0022991',
    sections: [
      {
        id: 'flagging-articles',
        title: 'Flagging Articles',
        body: 'Click the Flag Article button in the article header, enter a reason, and submit the flag.',
      },
      {
        id: 'approvers',
        title: 'Publishing Approvers',
        // Multi-line body to exercise whitespace normalisation
        body: 'Authorised approvers include:\n- Richard Danilowicz\n- Samantha Eaton\n- Matthew Renner',
      },
    ],
  },
  SNOW_FORM: {
    id: 'SNOW_FORM',
    title: 'ServiceNow Technical Knowledge Article Form',
    version: 'live',
    url: 'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB18801781',
    sections: [
      {
        id: 'required-fields',
        title: 'Required Fields',
        body: 'Required fields: Knowledge Base, Category, Short description, Article body.',
      },
    ],
  },
}

const goodResponse: KbResponse = {
  can_answer: true,
  answer: 'Click Flag Article in the article header.',
  citations: [{
    source_id: 'KB0022991',
    section_id: 'flagging-articles',
    quote: 'Click the Flag Article button in the article header',
  }],
}

describe('validateCitations — pass-through', () => {
  it('can_answer=false passes through untouched (no citation processing)', () => {
    const response: KbResponse = {
      can_answer: false,
      answer: FALLBACK_STRING,
      citations: [],
    }
    const result = validateCitations(response, FIXTURE)
    expect(result.can_answer).toBe(false)
    expect(result.answer).toBe(FALLBACK_STRING)
    expect(result.citations).toEqual([])
    expect(result._flips).toEqual([])
  })

  it('can_answer=false drops any citations the model sent (should be empty but be defensive)', () => {
    const response: KbResponse = {
      can_answer: false,
      answer: FALLBACK_STRING,
      citations: [{ source_id: 'KB0022991', section_id: 'flagging-articles', quote: 'whatever' }],
    }
    const result = validateCitations(response, FIXTURE)
    expect(result.citations).toEqual([])
  })
})

describe('validateCitations — good citation', () => {
  it('passes a verbatim-quoted citation through', () => {
    const result = validateCitations(goodResponse, FIXTURE)
    expect(result.can_answer).toBe(true)
    expect(result.citations).toHaveLength(1)
    expect(result.citations[0].section_id).toBe('flagging-articles')
    expect(result._flips).toEqual([])
  })

  it('passes a citation whose quote has different whitespace from registry body', () => {
    // Registry body: "Authorised approvers include:\n- Richard Danilowicz\n- Samantha Eaton\n..."
    // Model quote with different whitespace but same substring after normalisation:
    const response: KbResponse = {
      can_answer: true,
      answer: 'The approvers are listed in KB0022991.',
      citations: [{
        source_id: 'KB0022991',
        section_id: 'approvers',
        quote: 'Authorised approvers include: - Richard Danilowicz - Samantha Eaton',
      }],
    }
    const result = validateCitations(response, FIXTURE)
    expect(result.citations).toHaveLength(1)
    expect(result._flips).toEqual([])
  })
})

describe('validateCitations — strip cases', () => {
  it('strips fabricated quote (not a substring of body)', () => {
    const response: KbResponse = {
      ...goodResponse,
      citations: [{
        source_id: 'KB0022991',
        section_id: 'flagging-articles',
        quote: 'This text does not appear in the body anywhere',
      }],
    }
    const result = validateCitations(response, FIXTURE)
    // All stripped → fallback flip
    expect(result.can_answer).toBe(false)
    expect(result.answer).toBe(FALLBACK_STRING)
    expect(result.citations).toEqual([])
    expect(result._flips).toHaveLength(1)
    expect(result._flips[0].reason).toBe('quote_not_in_body')
  })

  it('strips fabricated section_id', () => {
    const response: KbResponse = {
      ...goodResponse,
      citations: [{
        source_id: 'KB0022991',
        section_id: 'section-that-does-not-exist',
        quote: 'Click the Flag Article button',
      }],
    }
    const result = validateCitations(response, FIXTURE)
    expect(result.can_answer).toBe(false)
    expect(result.answer).toBe(FALLBACK_STRING)
    expect(result._flips[0].reason).toBe('unknown_section_id')
  })

  it('strips fabricated source_id', () => {
    const response: KbResponse = {
      ...goodResponse,
      citations: [{
        source_id: 'KB_FAKE' as any,
        section_id: 'flagging-articles',
        quote: 'Click the Flag Article button',
      }],
    }
    const result = validateCitations(response, FIXTURE)
    expect(result.can_answer).toBe(false)
    expect(result.answer).toBe(FALLBACK_STRING)
    expect(result._flips[0].reason).toBe('unknown_source_id')
  })

  it('strips a citation whose quote differs only by capitalisation (case-sensitive)', () => {
    const response: KbResponse = {
      ...goodResponse,
      citations: [{
        source_id: 'KB0022991',
        section_id: 'flagging-articles',
        quote: 'click the flag article button',  // lowercase — should fail
      }],
    }
    const result = validateCitations(response, FIXTURE)
    expect(result.can_answer).toBe(false)
    expect(result._flips[0].reason).toBe('quote_not_in_body')
  })

  it('strips a paraphrased quote (not verbatim)', () => {
    const response: KbResponse = {
      ...goodResponse,
      citations: [{
        source_id: 'KB0022991',
        section_id: 'flagging-articles',
        quote: 'Press Flag Article button in header',  // paraphrase — should fail
      }],
    }
    const result = validateCitations(response, FIXTURE)
    expect(result.can_answer).toBe(false)
    expect(result._flips[0].reason).toBe('quote_not_in_body')
  })
})

describe('validateCitations — GRND-04 (≤1 citation)', () => {
  it('trims to one when multiple valid citations survive', () => {
    const response: KbResponse = {
      can_answer: true,
      answer: 'See both sections.',
      citations: [
        { source_id: 'KB0022991', section_id: 'flagging-articles', quote: 'Click the Flag Article button' },
        { source_id: 'SNOW_FORM', section_id: 'required-fields', quote: 'Required fields: Knowledge Base' },
      ],
    }
    const result = validateCitations(response, FIXTURE)
    expect(result.can_answer).toBe(true)
    expect(result.citations).toHaveLength(1)
    expect(result.citations[0].section_id).toBe('flagging-articles') // first one kept
    expect(result._flips).toHaveLength(1)
    expect(result._flips[0].reason).toBe('trimmed_excess_citation')
  })

  it('mixed case: one valid, one fabricated — valid kept, fabricated logged', () => {
    const response: KbResponse = {
      can_answer: true,
      answer: 'See these.',
      citations: [
        { source_id: 'KB0022991', section_id: 'flagging-articles', quote: 'Click the Flag Article button' },
        { source_id: 'KB0022991', section_id: 'flagging-articles', quote: 'FABRICATED' },
      ],
    }
    const result = validateCitations(response, FIXTURE)
    expect(result.citations).toHaveLength(1)
    expect(result.citations[0].quote).toBe('Click the Flag Article button')
    expect(result._flips).toHaveLength(1)
    expect(result._flips[0].reason).toBe('quote_not_in_body')
  })
})

describe('validateCitations — edge: empty citations array on can_answer true', () => {
  it('treats empty citations as total-strip → fallback flip', () => {
    const response: KbResponse = { can_answer: true, answer: 'Some answer.', citations: [] }
    const result = validateCitations(response, FIXTURE)
    expect(result.can_answer).toBe(false)
    expect(result.answer).toBe(FALLBACK_STRING)
    expect(result.citations).toEqual([])
  })
})
