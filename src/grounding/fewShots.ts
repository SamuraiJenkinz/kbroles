import type { KbResponse } from '@/grounding/schema'
import { FALLBACK_STRING } from '@/grounding/fallback'
import type { Role } from '@/grounding/rolePreludes'

export interface FewShot {
  question: string
  response: KbResponse
}

/**
 * Two few-shots per role — one in-scope with a valid citation, one out-of-scope
 * with the fallback response. Teaches structure (can_answer shape + citation
 * shape + fallback shape) without bloating context.
 *
 * The `quote` values MUST be verbatim substrings of the registry section
 * bodies (whitespace-normalised). These are asserted by hand against
 * src/grounding/sources/*.md on authoring. If a test ever flags a mismatch
 * (validator strips a few-shot quote at eval time in Phase 6), update the
 * quote here to match whatever is in the source file.
 *
 * Current verified substrings:
 *   - consumer: KB0022991/flagging-articles body contains:
 *       "Click the **Flag Article** button in the article header"
 *   - author:   KB0020882/naming-convention body contains:
 *       "[Application/Topic] - [Type Descriptor] - [OPCO or Line of Business] - [Region]"
 */
export const FEW_SHOTS: Record<Role, FewShot[]> = {
  consumer: [
    {
      question: 'How do I flag an article that has incorrect information?',
      response: {
        can_answer: true,
        answer:
          'Click the Flag Article button in the article header, enter a reason describing what is incorrect, and submit. ServiceNow creates a knowledge feedback task and the CTSS Knowledge team reviews and actions it.',
        citations: [
          {
            source_id: 'KB0022991',
            section_id: 'flagging-articles',
            // Verbatim substring of REGISTRY.KB0022991.sections['flagging-articles'].body
            // (includes markdown bold markers, which the validator preserves because
            // normalisation only collapses whitespace).
            quote: 'Click the **Flag Article** button in the article header',
          },
        ],
      },
    },
    {
      question: 'Can you tell me the weather forecast for Dallas?',
      response: {
        can_answer: false,
        answer: FALLBACK_STRING,
        citations: [],
      },
    },
  ],
  author: [
    {
      question: 'What format does the Short description field need to follow?',
      response: {
        can_answer: true,
        answer:
          'Titles follow the four-part naming convention: [Application/Topic] - [Type Descriptor] - [OPCO or Line of Business] - [Region], with a 160-character hard limit. Region options are EMEA, NASA, APAC, or Global.',
        citations: [
          {
            source_id: 'KB0020882',
            section_id: 'naming-convention',
            // Verbatim substring of REGISTRY.KB0020882.sections['naming-convention'].body.
            quote:
              '[Application/Topic] - [Type Descriptor] - [OPCO or Line of Business] - [Region]',
          },
        ],
      },
    },
    {
      question: 'What is the approval workflow for the HR knowledge base?',
      response: {
        can_answer: false,
        answer: FALLBACK_STRING,
        citations: [],
      },
    },
  ],
}
