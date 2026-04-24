/**
 * Question and identifier hashing helpers (Phase 6 — Plan 02).
 *
 * Provides PII-safe one-way hashes for question text and stable identifiers
 * (session IDs, user OIDs) so telemetry events can be correlated across a
 * session without persisting raw user input or personally-identifiable fields.
 *
 * Design:
 *   - Uses Node `crypto.createHash('sha256')` synchronously — the Web Crypto
 *     `subtle.digest()` API is async and unusable on the hot streaming path.
 *   - Output is the first 16 hex characters (64-bit prefix) of the digest.
 *     This is sufficient entropy for gap-detection correlation while keeping
 *     App Insights dimension values short.
 *   - A shared QUESTION_HASH_SALT (from AWS Secrets Manager via Plan 01's
 *     loadSecrets()) prevents rainbow-table attacks on the 64-bit space.
 *     When the env var is absent (local dev, CI without AWS), the salt is the
 *     empty string — no throw, no warning. An INFO log is NOT emitted per
 *     request; callers use empty-salt hashes for local dev and rotate the
 *     salt only in production.
 *
 * PII boundary:
 *   hashQuestion() normalises + hashes — raw text NEVER leaves this module.
 *   hashIdentifier() is for stable stable IDs (OID, UPN) — not free text.
 */
import { createHash } from 'node:crypto'

const SALT_ENV = 'QUESTION_HASH_SALT'

/**
 * NFC-normalise, lowercase, collapse whitespace, trim, strip trailing .?!
 *
 * The normalisation chain ensures that all surface variants of the same
 * question (different capitalisation, extra spaces, trailing punctuation)
 * produce the same hash, enabling gap-detection aggregation in workbooks.
 */
export function normaliseQuestion(raw: string): string {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!]+$/, '')
    .trim()
}

/**
 * Returns the first 16 hex characters of SHA-256(salt + normalised question).
 *
 * @param raw - Raw question text from the user. Never emitted to telemetry.
 */
export function hashQuestion(raw: string): string {
  const salt = process.env[SALT_ENV] ?? ''
  return createHash('sha256').update(salt + normaliseQuestion(raw)).digest('hex').slice(0, 16)
}

/**
 * Returns the first 16 hex characters of SHA-256(salt + identifier).
 *
 * Used for hashing stable identifiers such as iron-session OID or UPN so
 * telemetry events can be correlated per-user without storing PII.
 *
 * @param raw - A stable identifier (OID, UPN, session key). NOT free text.
 */
export function hashIdentifier(raw: string): string {
  const salt = process.env[SALT_ENV] ?? ''
  return createHash('sha256').update(salt + raw).digest('hex').slice(0, 16)
}
