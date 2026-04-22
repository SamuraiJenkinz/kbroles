import { describe, it, expect } from 'vitest'
import { ENTITY_ALLOWLIST } from '@/grounding/entities'

// PROJECT.md Context: "Publishing approvers (as referenced by the assistant):
// Richard Danilowicz, Samantha Eaton, Nicholas Hile, Matthew Renner,
// Julie Ramos, Brandon Young, Spencer Barratt."
const APPROVERS = [
  'Richard Danilowicz',
  'Samantha Eaton',
  'Nicholas Hile',
  'Matthew Renner',
  'Julie Ramos',
  'Brandon Young',
  'Spencer Barratt',
]

describe('ENTITY_ALLOWLIST', () => {
  it('is populated (non-empty)', () => {
    expect(ENTITY_ALLOWLIST.names.size).toBeGreaterThan(0)
    expect(ENTITY_ALLOWLIST.kbIds.size).toBeGreaterThan(0)
    expect(ENTITY_ALLOWLIST.urls.size).toBeGreaterThan(0)
  })

  it.each(APPROVERS)('contains approver %s', (name) => {
    expect(ENTITY_ALLOWLIST.names.has(name)).toBe(true)
  })

  it('contains all three KB IDs (KB0020882, KB0022991, KB18801781)', () => {
    expect(ENTITY_ALLOWLIST.kbIds.has('KB0020882')).toBe(true)
    expect(ENTITY_ALLOWLIST.kbIds.has('KB0022991')).toBe(true)
    expect(ENTITY_ALLOWLIST.kbIds.has('KB18801781')).toBe(true)
  })

  it('contains the ServiceNow permalink base for each source', () => {
    const hasPermalink = Array.from(ENTITY_ALLOWLIST.urls).some(u =>
      u.startsWith('https://mmcnow.service-now.com/kb_view.do')
    )
    expect(hasPermalink).toBe(true)
  })
})
