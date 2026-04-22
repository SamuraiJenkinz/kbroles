import type { JSONSchema7 } from 'json-schema'

// Locked per 01-CONTEXT.md §2. Do NOT add minItems/maxItems to citations
// (GRND-04 ≤1-citation rule is enforced by prompt + validator, not schema).
export const CITATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['can_answer', 'answer', 'citations'],
  properties: {
    can_answer: { type: 'boolean' },
    answer:     { type: 'string' },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['source_id', 'section_id', 'quote'],
        properties: {
          source_id:  { type: 'string', enum: ['KB0020882', 'KB0022991', 'SNOW_FORM'] },
          section_id: { type: 'string', description: 'Must match a <!-- section:ID --> anchor inside <sources>.' },
          quote:      { type: 'string', maxLength: 280 },
        },
      },
    },
  },
} as const satisfies JSONSchema7

// Narrowed TypeScript shape matching the JSON Schema
export type SourceId = 'KB0020882' | 'KB0022991' | 'SNOW_FORM'
export interface Citation {
  source_id: SourceId
  section_id: string
  quote: string
}
export interface KbResponse {
  can_answer: boolean
  answer: string
  citations: Citation[]
}
