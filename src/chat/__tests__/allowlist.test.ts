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

describe('checkEntityAllowlist — Tier 2 case-insensitive substring fallback (Quick 011)', () => {
  // Background: NAME_RE requires both words title-cased to match. Source bodies
  // often use sentence-case ("Knowledge base"), so the lowercase variant is
  // never harvested into the strict allowlist. LLMs writing the natural
  // title-case form ("Knowledge Base") then trip the check unfairly.
  // Tier 2 falls back to a case-insensitive substring match against the
  // lowercased source corpus, allowing source-mentioned terms in any casing
  // while preserving the fabricated-name guard.

  it('passes "Knowledge Base" (title-case) — source has "Knowledge base" lowercase b', () => {
    // Source mention proven by `grep -oi "knowledge base" src/grounding/sources/*.md`
    // — appears in kb0020882.md in multiple casings.
    const result = checkEntityAllowlist(
      'The Knowledge Base field is pre-filled and should not be changed.',
    )
    expect(result).toEqual({ passed: true })
  })

  it('passes "Subject Matter" — source has "Subject matter expert" mixed-case', () => {
    // Phrasing note: NAME_RE matches the FIRST title-case bigram greedy-
    // left-to-right. We avoid a preceding title-case word so the capture
    // lands on "Subject Matter" cleanly (not e.g. "The Subject", which
    // doesn't appear in the corpus).
    const result = checkEntityAllowlist(
      'Each article documents the Subject Matter expert assignment.',
    )
    expect(result).toEqual({ passed: true })
  })

  it('passes "Resolution Field" — source has both casings', () => {
    // Same NAME_RE phrasing constraint as above. "The Resolution" actually
    // appears in source bodies title-case-both ("The Resolution field
    // contains..."), so the first-match capture would pass Tier 1 directly.
    // To isolate the Tier 2 substring fallback specifically, phrase the
    // test so NAME_RE captures only "Resolution Field".
    const result = checkEntityAllowlist(
      'An article completes the Resolution Field with solution steps.',
    )
    expect(result).toEqual({ passed: true })
  })

  it('passes "Configuration Item" — source has title-case (already in Tier 1, but verifies Tier 2 path is non-destructive)', () => {
    const result = checkEntityAllowlist(
      'Every article must reference a valid Configuration Item.',
    )
    expect(result).toEqual({ passed: true })
  })

  it('STILL FAILS on a fabricated title-case name that does not appear in any casing in the source corpus', () => {
    // "Acme Corporation" appears NOWHERE in the kbroles SOPs — must fail
    // both Tier 1 (strict equality) and Tier 2 (substring fallback).
    const result = checkEntityAllowlist(
      'According to Acme Corporation, the process is straightforward.',
    )
    expect(result).toEqual({ passed: false, violationClass: 'names', tokenCount: 1 })
  })

  it('STILL FAILS on a fabricated approver name ("Jane Doe") — invariant from original CORP-02', () => {
    // Re-asserts the original fabricated-name test under the new Tier 2 logic.
    // Jane Doe is not in any source body in any casing → fails both tiers.
    const result = checkEntityAllowlist('Per Jane Doe, the SOP requires step 4.')
    expect(result).toEqual({ passed: false, violationClass: 'names', tokenCount: 1 })
  })

  it('counts multiple bad names correctly when some pass Tier 2 and some fail', () => {
    // "Knowledge Base" passes (Tier 2 — substring in corpus).
    // "Acme Corporation" fails (not in corpus at all).
    // "Jane Doe" fails (not in corpus at all).
    // Expect tokenCount: 2 (the two real fabrications).
    const result = checkEntityAllowlist(
      'The Knowledge Base field was reviewed by Acme Corporation and Jane Doe.',
    )
    expect(result).toEqual({ passed: false, violationClass: 'names', tokenCount: 2 })
  })
})
