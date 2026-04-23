/**
 * mailto.ts — unit tests for buildFlagGapMailto
 *
 * Pure node env — no jsdom required (no DOM APIs used).
 */

import { describe, it, expect } from 'vitest'
import { buildFlagGapMailto } from '../mailto'

const EMAIL = 'kb-knowledge-team@mmc.com'
const FIXED_TS = '2026-04-23T10:00:00.000Z'

describe('buildFlagGapMailto', () => {
  // Test 1: URL starts with correct mailto prefix
  it('returns a string starting with mailto:<email>?', () => {
    const url = buildFlagGapMailto({
      email: EMAIL,
      question: 'test question',
      role: 'author',
      requestId: 'req-xyz',
      timestamp: FIXED_TS,
    })
    expect(url).toMatch(new RegExp(`^mailto:${EMAIL.replace(/[.@]/g, '\\$&')}\\?`))
  })

  // Test 2: Subject encoded with %20 for spaces (encodeURIComponent, not encodeURI)
  it('subject contains %20 for spaces (encodeURIComponent)', () => {
    const url = buildFlagGapMailto({
      email: EMAIL,
      question: 'any question',
      role: 'author',
      requestId: 'req-xyz',
      timestamp: FIXED_TS,
    })
    // The subject should have %20 not + for spaces
    expect(url).toContain('subject=KB%20Assistant')
    // Role is appended in the subject
    expect(url).toContain('author')
  })

  // Test 3: Body uses %0D%0A (CRLF) between lines — NOT bare %0A
  it('body encoded with %0D%0A (CRLF) between lines, not %0A alone', () => {
    const url = buildFlagGapMailto({
      email: EMAIL,
      question: 'What is flagging?',
      role: 'consumer',
      requestId: 'req-abc',
      timestamp: FIXED_TS,
    })
    // CRLF separators must be present
    expect(url).toContain('%0D%0A')
    // No bare LF without preceding CR
    const bodyPart = url.split('&body=')[1]
    const decoded = decodeURIComponent(bodyPart)
    // All newlines in the decoded body should be CRLF (verify \r\n pairs)
    const crlfCount = (decoded.match(/\r\n/g) ?? []).length
    const lfOnlyCount = (decoded.match(/(?<!\r)\n/g) ?? []).length
    expect(crlfCount).toBeGreaterThan(0)
    expect(lfOnlyCount).toBe(0)
  })

  // Test 4: Special characters in question are preserved via encodeURIComponent
  it('encodes special chars in question: & = ? → %26 %3D %3F', () => {
    const url = buildFlagGapMailto({
      email: EMAIL,
      question: 'A & B=C?',
      role: 'author',
      requestId: 'req-xyz',
      timestamp: FIXED_TS,
    })
    const bodyPart = url.split('&body=')[1]
    // The raw URL contains the encoded question content
    expect(bodyPart).toContain('A%20%26%20B%3DC%3F')
  })

  // Test 5: Fixed timestamp produces deterministic output — snapshot
  it('produces deterministic output with fixed timestamp', () => {
    const url = buildFlagGapMailto({
      email: EMAIL,
      question: 'How do I flag?',
      role: 'author',
      requestId: 'req-xyz',
      timestamp: FIXED_TS,
    })
    // Snapshot: verify exact URL structure is stable
    expect(url).toMatchInlineSnapshot(
      `"mailto:kb-knowledge-team@mmc.com?subject=KB%20Assistant%3A%20unanswered%20question%20(role%3A%20author)&body=Question%3A%0D%0AHow%20do%20I%20flag%3F%0D%0A%0D%0ARole%3A%20author%0D%0ATimestamp%3A%202026-04-23T10%3A00%3A00.000Z%0D%0ARequest%20ID%3A%20req-xyz"`
    )
  })

  // Test 6: All four body fields present in decoded body
  it('decoded body contains Question, Role, Timestamp, Request ID fields', () => {
    const url = buildFlagGapMailto({
      email: EMAIL,
      question: 'Is this covered?',
      role: 'author',
      requestId: 'req-xyz',
      timestamp: FIXED_TS,
    })
    const bodyPart = url.split('&body=')[1]
    const decoded = decodeURIComponent(bodyPart)
    expect(decoded).toContain('Question:')
    expect(decoded).toContain('Is this covered?')
    expect(decoded).toContain('Role: author')
    expect(decoded).toContain('Timestamp: 2026-04-23')
    expect(decoded).toContain('Request ID: req-xyz')
  })
})
