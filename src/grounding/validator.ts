import type { KbResponse, Citation, SourceId } from '@/grounding/schema'
import type { Registry, Source } from '@/grounding/registry'
import { FALLBACK_STRING } from '@/grounding/fallback'

export type FlipReason =
  | 'unknown_source_id'
  | 'unknown_section_id'
  | 'quote_not_in_body'
  | 'trimmed_excess_citation'

export interface FallbackFlip {
  source_id: string
  section_id: string
  reason: FlipReason
}

export interface ValidationResult extends KbResponse {
  /**
   * Diagnostic record of every citation the validator stripped.
   * Phase 2 will log this on the server per request.
   * Not part of the LLM response contract — prefixed `_` to signal non-wire.
   */
  _flips: FallbackFlip[]
}

/**
 * Normalise whitespace for quote-matching: collapse runs of whitespace to
 * single space, trim. Case-sensitive, no punctuation folding. Matches how
 * humans transcribe quotes from rendered markdown (line-wrap insensitive)
 * without loosening the contract enough to let paraphrases through.
 */
function normalise(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function quoteExistsInBody(quote: string, body: string): boolean {
  return normalise(body).includes(normalise(quote))
}

function findSourceForId(registry: Registry, id: string): Source | undefined {
  // Guarded lookup — `id` comes from the LLM and may not be a valid SourceId key.
  return (registry as Record<string, Source | undefined>)[id]
}

/**
 * Validate citations against the registry.
 * - Pass-through answer/can_answer when can_answer is false; citations forced to [].
 * - Strip citations whose source_id / section_id / quote can't be verified.
 * - On total strip with can_answer true → flip to fallback.
 * - If >1 valid citation survives, keep only the first (GRND-04).
 */
export function validateCitations(
  response: KbResponse,
  registry: Registry
): ValidationResult {
  const flips: FallbackFlip[] = []

  // Rule 1: can_answer=false — skip citation validation. Preserve answer
  // and can_answer; force citations to [] defensively. The schema contract
  // (CONTEXT.md §2) requires can_answer=false → citations=[], so if the
  // model emitted citations alongside can_answer=false they are contract
  // violations and we never want to surface them. This is NOT a flip — we
  // do not rewrite answer or toggle can_answer.
  if (response.can_answer === false) {
    return { ...response, citations: [], _flips: flips }
  }

  // Rule 2: validate each citation.
  const survivors: Citation[] = []
  for (const cite of response.citations) {
    const source = findSourceForId(registry, cite.source_id)
    if (!source) {
      flips.push({
        source_id: cite.source_id,
        section_id: cite.section_id,
        reason: 'unknown_source_id',
      })
      continue
    }
    const section = source.sections.find(s => s.id === cite.section_id)
    if (!section) {
      flips.push({
        source_id: cite.source_id,
        section_id: cite.section_id,
        reason: 'unknown_section_id',
      })
      continue
    }
    if (!quoteExistsInBody(cite.quote, section.body)) {
      flips.push({
        source_id: cite.source_id,
        section_id: cite.section_id,
        reason: 'quote_not_in_body',
      })
      continue
    }
    survivors.push({
      source_id: cite.source_id as SourceId,
      section_id: cite.section_id,
      quote: cite.quote,
    })
  }

  // Rule 3: total strip → fallback flip.
  if (survivors.length === 0) {
    return {
      can_answer: false,
      answer: FALLBACK_STRING,
      citations: [],
      _flips: flips,
    }
  }

  // Rule 4: enforce GRND-04 (≤1 citation) — keep only the first.
  if (survivors.length > 1) {
    for (let i = 1; i < survivors.length; i++) {
      flips.push({
        source_id: survivors[i].source_id,
        section_id: survivors[i].section_id,
        reason: 'trimmed_excess_citation',
      })
    }
  }

  return {
    can_answer: true,
    answer: response.answer,
    citations: [survivors[0]],
    _flips: flips,
  }
}
