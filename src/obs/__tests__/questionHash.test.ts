/**
 * Unit tests for src/obs/questionHash.ts
 *
 * Verifies:
 *   - normaliseQuestion() NFC, case-insensitive, whitespace collapse,
 *     trailing-punctuation strip.
 *   - hashQuestion() stability across surface variants (same normalised form).
 *   - hashQuestion() distinguishes different inputs.
 *   - Salt rotation changes the output.
 *   - Hash is exactly 16 hex characters (64-bit prefix of SHA-256).
 *   - PII absence: no substring of the raw input appears in the hex output.
 *   - hashIdentifier() is deterministic for the same input + salt.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { normaliseQuestion, hashQuestion, hashIdentifier } from '../questionHash'

// Store the original value so we can restore it without vi.unstubAllEnvs()
// (which would wipe other env vars set by the test suite's beforeEach blocks).
const ORIGINAL_SALT = process.env.QUESTION_HASH_SALT

afterEach(() => {
  // Restore QUESTION_HASH_SALT after each test to prevent leakage.
  if (ORIGINAL_SALT === undefined) {
    delete process.env.QUESTION_HASH_SALT
  } else {
    process.env.QUESTION_HASH_SALT = ORIGINAL_SALT
  }
})

// =============================================================================
// normaliseQuestion()
// =============================================================================

describe('normaliseQuestion()', () => {
  it('lowercases and strips trailing ?', () => {
    expect(normaliseQuestion('How do I RESET my PASSWORD?')).toBe(
      'how do i reset my password',
    )
  })

  it('trims leading and trailing whitespace', () => {
    expect(normaliseQuestion('   leading/trailing   ')).toBe('leading/trailing')
  })

  it('collapses internal whitespace runs to a single space', () => {
    expect(normaliseQuestion('too   many    spaces')).toBe('too many spaces')
  })

  it('strips trailing . and !', () => {
    expect(normaliseQuestion('End with period.')).toBe('end with period')
    expect(normaliseQuestion('End with exclamation!')).toBe('end with exclamation')
  })

  it('strips multiple trailing punctuation characters', () => {
    expect(normaliseQuestion('Really?!')).toBe('really')
  })

  it('NFC normalisation: composed and decomposed forms produce the same output', () => {
    // 'é' can be represented as a single U+00E9 (composed, NFC) or as
    // 'e' + U+0301 combining acute accent (decomposed, NFD).
    const composed = 'é' // é as single code point (NFC)
    const decomposed = 'é' // e + combining acute (NFD)
    expect(normaliseQuestion(`caf${composed}`)).toBe(normaliseQuestion(`caf${decomposed}`))
  })
})

// =============================================================================
// hashQuestion()
// =============================================================================

describe('hashQuestion()', () => {
  it('produces identical hashes for surface variants of the same question', () => {
    // All three normalise to 'hello'
    const h1 = hashQuestion('Hello')
    const h2 = hashQuestion('hello.')
    const h3 = hashQuestion('  HELLO  ?')
    expect(h1).toBe(h2)
    expect(h2).toBe(h3)
  })

  it('produces different hashes for genuinely different inputs', () => {
    expect(hashQuestion('A')).not.toBe(hashQuestion('B'))
  })

  it('is exactly 16 hex characters (64-bit prefix)', () => {
    const hash = hashQuestion('Any question text')
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('salt rotation changes the hash output', () => {
    process.env.QUESTION_HASH_SALT = 'alpha'
    const hashAlpha = hashQuestion('stable input')

    process.env.QUESTION_HASH_SALT = 'beta'
    const hashBeta = hashQuestion('stable input')

    expect(hashAlpha).not.toBe(hashBeta)
  })

  it('PII absence: raw input substrings do not appear in the hex output', () => {
    const raw = 'my email is tay@example.com'
    const hash = hashQuestion(raw)
    expect(hash).not.toContain('tay')
    expect(hash).not.toContain('example')
    expect(hash).not.toContain('@')
  })

  it('empty salt (no env var) does not throw and returns a 16-char hex string', () => {
    delete process.env.QUESTION_HASH_SALT
    expect(() => hashQuestion('some question')).not.toThrow()
    expect(hashQuestion('some question')).toMatch(/^[0-9a-f]{16}$/)
  })
})

// =============================================================================
// hashIdentifier()
// =============================================================================

describe('hashIdentifier()', () => {
  it('is deterministic for the same input and salt', () => {
    process.env.QUESTION_HASH_SALT = 'test-salt'
    const id = 'entra-oid-abc-123'
    expect(hashIdentifier(id)).toBe(hashIdentifier(id))
  })

  it('produces a 16-char hex string', () => {
    expect(hashIdentifier('any-stable-id')).toMatch(/^[0-9a-f]{16}$/)
  })

  it('produces a different hash for a different identifier', () => {
    expect(hashIdentifier('oid-one')).not.toBe(hashIdentifier('oid-two'))
  })
})
