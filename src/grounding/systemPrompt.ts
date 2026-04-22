import { REGISTRY, type Source, type Registry } from '@/grounding/registry'
import { ROLE_PRELUDES, type Role } from '@/grounding/rolePreludes'
import { COMMON_RULES_HEADER, COMMON_RULES_FOOTER } from '@/grounding/commonRules'
import { FEW_SHOTS, type FewShot } from '@/grounding/fewShots'

export type { Role } from '@/grounding/rolePreludes'

/**
 * Render a single <source> XML block with all its section anchors intact.
 * The section bodies are preserved verbatim as they came from the registry
 * parser (trim()'d but otherwise untouched). We reconstruct the wrapping
 * <source> tag + re-emit each section prefixed with its
 * <!-- section:ID --> anchor so the model can cite stable kebab-case IDs.
 *
 * Pitfall #19 prevention: the <!-- section:ID --> marker format is identical
 * to what the registry parser keys off AND what the validator expects in
 * citation.section_id, so there is exactly one anchor convention across the
 * whole stack.
 */
function renderSingleSource(source: Source): string {
  const sectionsText = source.sections
    .map(s => `<!-- section:${s.id} -->\n${s.body}`)
    .join('\n\n')
  return `<source id="${source.id}" title="${source.title}" version="${source.version}" url="${source.url}">\n${sectionsText}\n</source>`
}

/**
 * Render the full <sources>...</sources> block from the registry.
 * Pure function of its input — same REGISTRY → same output, byte-for-byte.
 */
export function renderSources(registry: Registry): string {
  const blocks = Object.values(registry).map(renderSingleSource)
  return `<sources>\n${blocks.join('\n\n')}\n</sources>`
}

/**
 * Render a single few-shot as an <example> block. The user question is wrapped
 * in <user>...</user> matching the injection-resistance framing from
 * COMMON_RULES_HEADER. The assistant response is emitted as pretty-printed
 * JSON so the model sees the exact KbResponse shape it must produce.
 */
function renderFewShot(shot: FewShot): string {
  const responseJson = JSON.stringify(shot.response, null, 2)
  return `<example>\n<user>${shot.question}</user>\n<assistant>\n${responseJson}\n</assistant>\n</example>`
}

function renderFewShots(role: Role): string {
  return FEW_SHOTS[role].map(renderFewShot).join('\n\n')
}

/**
 * Assemble the role-specific system prompt from layered named constants.
 *
 * Layer order (LOCKED per 01-CONTEXT.md §3):
 *   1. ROLE_PRELUDES[role]       — role tone + priorities (2–5 sentences)
 *   2. COMMON_RULES_HEADER       — grounding discipline + <citation_contract>
 *                                  + <user>...</user> injection-resist clause
 *   3. renderSources(REGISTRY)   — <sources> block, XML-tagged, anchors intact
 *   4. FEW_SHOTS[role]           — two examples (in-scope + out-of-scope)
 *   5. COMMON_RULES_FOOTER       — reiteration (PITFALLS #7 bookending)
 *
 * Layers joined with `\n\n`. Pure function: no side effects, deterministic
 * given REGISTRY and role. Called once per `/api/chat` request in Phase 2.
 *
 * GRND-05: this is the SINGLE composeSystemPrompt template. No divergent
 * prompt trees anywhere else in the codebase. Any divergence would mean
 * two places teaching the model the citation contract, which would
 * inevitably drift — this function is the single source of truth.
 */
export function composeSystemPrompt(role: Role): string {
  const layers = [
    ROLE_PRELUDES[role],
    COMMON_RULES_HEADER,
    renderSources(REGISTRY),
    renderFewShots(role),
    COMMON_RULES_FOOTER,
  ]
  return layers.join('\n\n')
}
