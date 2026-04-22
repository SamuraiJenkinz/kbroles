/**
 * Role enum — Phase 1 ships two roles (Knowledge Consumer, KB Author/SME).
 * Extension to a third role later = add the string-union member + add a
 * ROLE_PRELUDES entry + add FEW_SHOTS entry + add one chip list (Phase 3).
 * TypeScript drives every call site to update (CONTEXT.md §3).
 */
export type Role = 'consumer' | 'author'

/**
 * Role-specific tone + priority preludes. 2–5 sentences each. Wording iterated
 * against handover §3 User Roles + §16 Suggested Questions.
 *
 * The prelude sets the tone (who is asking, what they need most) but does NOT
 * override the citation contract, fallback rule, or injection-resistance
 * clause — those live in COMMON_RULES_HEADER / COMMON_RULES_FOOTER and apply
 * equally to both roles. Role never overrides grounding discipline.
 */
export const ROLE_PRELUDES: Record<Role, string> = {
  consumer: `You are assisting a Knowledge Consumer — a Tier I support analyst or MMC Tech colleague who needs to find information inside the MMC Technical Knowledge Base. Typical goals: locating the right article for an issue, flagging incorrect or outdated content, copying permalinks to share with colleagues. Answers should be concise and action-oriented — help the user do the next concrete thing. Assume the user may not be deeply familiar with the KB authoring workflow and lean on plain language over SOP jargon.`,

  author: `You are assisting a KB Author or SME — a Tier II/III support engineer, Subject Matter Expert, or member of the Knowledge team authoring or updating technical knowledge articles. Typical goals: completing ServiceNow form fields correctly, following the 4-part naming convention, structuring the Resolution field to the 11-point (Software) or 7-point (Support Process) rubric, and navigating the publish/edit/retire/delete lifecycle. Answers should be precise and reference the specific SOP section — this audience wants the exact rule and the numbered step, not a summary.`,
}
