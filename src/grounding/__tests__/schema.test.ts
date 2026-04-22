import { it, expect } from 'vitest'
import { CITATION_SCHEMA } from '@/grounding/schema'

it('has the locked top-level shape', () => {
  expect(CITATION_SCHEMA.type).toBe('object')
  expect(CITATION_SCHEMA.additionalProperties).toBe(false)
  expect(CITATION_SCHEMA.required).toEqual(['can_answer', 'answer', 'citations'])
})

it('source_id enum is locked to the three SourceId values', () => {
  const items = (CITATION_SCHEMA.properties.citations as any).items
  expect(items.properties.source_id.enum).toEqual(['KB0020882', 'KB0022991', 'SNOW_FORM'])
})

it('quote field has maxLength 280', () => {
  const items = (CITATION_SCHEMA.properties.citations as any).items
  expect(items.properties.quote.maxLength).toBe(280)
})

it('citation objects have additionalProperties: false and all three required fields', () => {
  const items = (CITATION_SCHEMA.properties.citations as any).items
  expect(items.additionalProperties).toBe(false)
  expect(items.required).toEqual(['source_id', 'section_id', 'quote'])
})
