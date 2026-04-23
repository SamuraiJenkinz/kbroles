/**
 * Canonical (source_id, section_id) → {colour, iconName, label} map.
 *
 * Used by BOTH citation chips (Phase-4 PANE-01) and the source panel header
 * (PANE-02). ONE source of truth prevents colour/icon drift between the two
 * surfaces. See Phase-4 CONTEXT.md §Colour-coding + RESEARCH §Canonical
 * Section → Colour Map.
 *
 * Key format: `${source_id}/${section_id}` — the slash separator prevents
 * collisions between e.g. `KB0020882/required-fields` and `SNOW_FORM/required-fields`.
 *
 * Pitfall 16 contract: every badge MUST render both colour AND iconName together.
 * Consumers must never show colour alone (fails colour-blind users) or icon
 * alone (loses semantic grouping). The invariant test in sourceBadges.test.ts
 * asserts that every map entry has both colour and iconName defined.
 */

export type BadgeColour = 'blue' | 'red' | 'green' | 'purple' | 'amber'

export interface BadgeDef {
  colour: BadgeColour
  /** lucide-react component name (e.g. 'Flag' → import { Flag } from 'lucide-react') */
  iconName: 'Flag' | 'Upload' | 'Paperclip' | 'Tags' | 'FileText' | 'ClipboardList'
  /** Human-readable section label for chip text + panel header */
  label: string
}

/**
 * Canonical SOURCE_BADGES map.
 * 22 entries covering every section_id in the corpus (6 KB0022991 + 9 KB0020882 + 7 SNOW_FORM).
 * Keyed by `${source_id}/${section_id}`.
 */
export const SOURCE_BADGES: Record<string, BadgeDef> = {
  // ── KB0022991 ─────────────────────────────────────────────────────────────
  // Flagging section → red (handover §14 "Flagging" group)
  'KB0022991/flagging-articles':  { colour: 'red',   iconName: 'Flag',         label: 'Flagging Articles' },

  // Publishing/Lifecycle sections → green (handover §14 "Publishing" group)
  'KB0022991/publishing-approval': { colour: 'green', iconName: 'Upload',       label: 'Publishing and Approval Workflow' },
  'KB0022991/approvers':           { colour: 'green', iconName: 'Upload',       label: 'Publishing Approvers' },
  'KB0022991/edit-retire-delete':  { colour: 'green', iconName: 'Upload',       label: 'Edit / Retire / Delete Lifecycle' },
  'KB0022991/knowledge-blocks':    { colour: 'green', iconName: 'Upload',       label: 'Knowledge Blocks (Knowledge Team Only)' },
  'KB0022991/criteria-check':      { colour: 'green', iconName: 'Upload',       label: 'Colleague Knowledge Criteria Check' },

  // ── KB0020882 ─────────────────────────────────────────────────────────────
  // Source-level colour = blue. All sections stay blue (RESEARCH §78: the
  // "Attachments purple" in handover §14 refers to SNOW_FORM attachment fields,
  // not KB0020882's attachments section). One exception: categorisation → amber
  // because handover §14 explicitly assigns "Categories amber" at section level.
  'KB0020882/who-can-submit':                   { colour: 'blue',  iconName: 'FileText',     label: 'Who Can Submit' },
  'KB0020882/article-creation-steps':           { colour: 'blue',  iconName: 'FileText',     label: 'Article Creation Steps' },
  'KB0020882/naming-convention':                { colour: 'blue',  iconName: 'FileText',     label: 'Article Naming Convention' },
  'KB0020882/required-fields':                  { colour: 'blue',  iconName: 'FileText',     label: 'Required Fields' },
  'KB0020882/resolution-field-software':        { colour: 'blue',  iconName: 'FileText',     label: 'Resolution Field — Software (11-point)' },
  'KB0020882/resolution-field-support-process': { colour: 'blue',  iconName: 'FileText',     label: 'Resolution Field — Support Process (7-point)' },
  'KB0020882/security-rules':                   { colour: 'blue',  iconName: 'FileText',     label: 'Security Rules' },
  'KB0020882/attachments':                      { colour: 'blue',  iconName: 'Paperclip',    label: 'Attachments' },
  'KB0020882/categorisation':                   { colour: 'amber', iconName: 'Tags',         label: 'Categorisation' },

  // ── SNOW_FORM ──────────────────────────────────────────────────────────────
  // Source-level colour = purple (handover §14 "Form" group)
  'SNOW_FORM/required-fields':    { colour: 'purple', iconName: 'ClipboardList', label: 'Required Fields' },
  'SNOW_FORM/short-description':  { colour: 'purple', iconName: 'ClipboardList', label: 'Short Description Field' },
  'SNOW_FORM/article-body':       { colour: 'purple', iconName: 'ClipboardList', label: 'Article Body Field' },
  'SNOW_FORM/resolution-field':   { colour: 'purple', iconName: 'ClipboardList', label: 'Resolution Field' },
  'SNOW_FORM/configuration-item': { colour: 'purple', iconName: 'ClipboardList', label: 'Configuration Item Field' },
  'SNOW_FORM/optional-fields':    { colour: 'purple', iconName: 'ClipboardList', label: 'Optional Fields' },
  'SNOW_FORM/workflow-fields':    { colour: 'purple', iconName: 'ClipboardList', label: 'Workflow State Fields' },
}

/**
 * Source-level fallback: colour + icon when `section_id` is not in SOURCE_BADGES.
 * Default for uncovered KB0022991 sections: amber (per CONTEXT.md).
 */
export const SOURCE_FALLBACK: Record<string, { colour: BadgeColour; iconName: BadgeDef['iconName'] }> = {
  KB0020882: { colour: 'blue',   iconName: 'FileText' },
  KB0022991: { colour: 'amber',  iconName: 'Tags' },
  SNOW_FORM:  { colour: 'purple', iconName: 'ClipboardList' },
}

/**
 * Resolve a (source_id, section_id) pair to its badge definition.
 * Falls back to source-level default when section is not in SOURCE_BADGES.
 * Falls back to amber/FileText for completely unknown source_ids (LLM
 * hallucination guard — should not occur in production, but must not crash).
 */
export function getSourceBadge(source_id: string, section_id: string): BadgeDef {
  const exact = SOURCE_BADGES[`${source_id}/${section_id}`]
  if (exact) return exact
  const fallback = SOURCE_FALLBACK[source_id] ?? { colour: 'amber' as BadgeColour, iconName: 'FileText' as BadgeDef['iconName'] }
  return { ...fallback, label: section_id } // degrade label to raw id for unknown sections
}

// ── Tailwind class families ────────────────────────────────────────────────
// Pitfall 16: colour NEVER appears alone without icon.
// Consumers MUST render the icon alongside these classes.

const BADGE_CLASSES: Record<BadgeColour, string> = {
  blue:   'bg-blue-50   text-blue-700   border-blue-200   dark:bg-blue-950/30   dark:text-blue-300   dark:border-blue-800',
  red:    'bg-red-50    text-red-700    border-red-200    dark:bg-red-950/30    dark:text-red-300    dark:border-red-800',
  green:  'bg-green-50  text-green-700  border-green-200  dark:bg-green-950/30  dark:text-green-300  dark:border-green-800',
  purple: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800',
  amber:  'bg-amber-50  text-amber-700  border-amber-200  dark:bg-amber-950/30  dark:text-amber-300  dark:border-amber-800',
}

const RING_CLASSES: Record<BadgeColour, string> = {
  blue:   'ring-2 ring-blue-500',
  red:    'ring-2 ring-red-500',
  green:  'ring-2 ring-green-500',
  purple: 'ring-2 ring-purple-500',
  amber:  'ring-2 ring-amber-500',
}

/** Returns the Tailwind class string for the badge background/text/border trio. */
export const badgeClassesFor = (c: BadgeColour): string => BADGE_CLASSES[c]

/** Returns the Tailwind ring class for an active citation chip. */
export const ringClassesFor = (c: BadgeColour): string => RING_CLASSES[c]
