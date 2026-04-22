/**
 * Out-of-scope fallback string — handover §15 Grounded Response Architecture,
 * also quoted in PROJECT.md Active Requirements and REQUIREMENTS.md FBK-01.
 *
 * This is the single source of truth for the fallback copy. The system prompt,
 * the validator (on total-strip flip), and the chat UI (FBK-01) all reference
 * this constant — do NOT hard-code the string anywhere else.
 */
export const FALLBACK_STRING =
  "That information isn't in the loaded documents yet. Flag the gap to the CTSS Knowledge team via KB0022991."
