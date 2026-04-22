import { describe, it, expect } from 'vitest'
import { checkEntityAllowlist } from '@/chat/allowlist'
import { ENTITY_ALLOWLIST } from '@/grounding/entities'

describe('checkEntityAllowlist — negative fixtures (02-CONTEXT §2)', () => {
  it('fails on a fabricated name ("Jane Doe")', () => {
    const result = checkEntityAllowlist('According to Jane Doe, the process is straightforward.')
    expect(result).toEqual({ passed: false, violationClass: 'names', tokenCount: 1 })
  })

  it('fails on a fabricated KB ID ("KB9999999")', () => {
    const result = checkEntityAllowlist('See KB9999999 for details.')
    expect(result).toEqual({ passed: false, violationClass: 'kbIds', tokenCount: 1 })
  })

  it('fails on a non-allowlisted URL', () => {
    const result = checkEntityAllowlist('See https://evil.example.com for details.')
    expect(result).toEqual({ passed: false, violationClass: 'urls', tokenCount: 1 })
  })
})

describe('checkEntityAllowlist — positive fixture (7 approvers + real KB + real URL)', () => {
  it('passes when every extracted entity is in the allowlist', () => {
    // The 7 approver names are harvested at module load from KB0022991's
    // "Publishing an Article" section. Confirm they are present so this
    // test is load-bearing, not a tautology.
    const approvers = [
      'Richard Danilowicz',
      'Samantha Eaton',
      'Nicholas Hile',
      'Matthew Renner',
      'Julie Ramos',
      'Brandon Young',
      'Spencer Barratt',
    ]
    for (const name of approvers) {
      expect(ENTITY_ALLOWLIST.names.has(name), `expected ENTITY_ALLOWLIST.names to contain "${name}"`).toBe(true)
    }
    expect(ENTITY_ALLOWLIST.kbIds.has('KB0020882')).toBe(true)
    expect(ENTITY_ALLOWLIST.urls.has(
      'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0020882',
    )).toBe(true)

    // Intentionally place the URL at whitespace (no trailing period).
    // The URL extractor is greedy and captures adjacent punctuation into
    // the match — the allowlist harvests URLs from the <source url="..">
    // attribute, which never has a trailing period, so a sentence-final
    // URL in model output would be a mismatch. This is the correct
    // authored pattern: URL followed by space/newline, not by punctuation.
    const text = `The approvers are ${approvers.join(', ')}. Reference KB0020882 at https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0020882 for the full SOP.`
    expect(checkEntityAllowlist(text)).toEqual({ passed: true })
  })
})

describe('checkEntityAllowlist — ordering rule', () => {
  it('returns the names violation first when both a bad name and a bad KB ID are present', () => {
    const result = checkEntityAllowlist('Per Jane Doe, see KB9999999 for next steps.')
    // Both classes have violations; names is tested first per CONTEXT §2
    // — the first failing class returns.
    expect(result).toEqual({ passed: false, violationClass: 'names', tokenCount: 1 })
  })
})

describe('checkEntityAllowlist — trivial cases', () => {
  it('passes on empty text (no extractions, no violations)', () => {
    expect(checkEntityAllowlist('')).toEqual({ passed: true })
  })

  it('counts multiple bad names in a single answer', () => {
    const result = checkEntityAllowlist('Jane Doe said that John Smith approved the change.')
    expect(result).toEqual({ passed: false, violationClass: 'names', tokenCount: 2 })
  })
})
