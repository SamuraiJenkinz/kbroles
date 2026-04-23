/**
 * Build a mailto: URL for FBK-04 flag-a-gap workflow.
 *
 * RFC 2368 + Outlook compatibility:
 *   - encodeURIComponent() (NOT encodeURI) — spaces → %20, encodes ?,=,&,#.
 *   - Body line breaks use %0D%0A (CRLF) — Outlook on Windows renders %0A
 *     (LF alone) as literal \n in some configurations.
 */

export interface FlagGapParams {
  email: string
  question: string
  role: 'consumer' | 'author'
  requestId: string
  timestamp?: string // ISO 8601; defaults to new Date().toISOString()
}

export function buildFlagGapMailto(params: FlagGapParams): string {
  const {
    email,
    question,
    role,
    requestId,
    timestamp = new Date().toISOString(),
  } = params
  const subject = `KB Assistant: unanswered question (role: ${role})`
  const bodyLines = [
    'Question:',
    question,
    '',
    `Role: ${role}`,
    `Timestamp: ${timestamp}`,
    `Request ID: ${requestId}`,
  ]
  // Join with CRLF for Outlook compatibility (RFC 2368)
  const body = bodyLines.join('\r\n')
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
