/**
 * section_id → human-readable title map.
 *
 * Used by:
 *   - UTIL-01 copy-suffix   → "(Source: KB0022991 · Flagging Articles)"
 *   - Phase-4 source panel  → section header labels (PANE-01)
 *
 * Keys are stable kebab-case anchors (e.g. 'flagging-articles', 'approvers')
 * matching validated citation.section_id values from the grounding registry.
 *
 * Unknown keys return undefined so callers can fall back to source_id alone
 * (UTIL-01 copy-suffix degrades gracefully per CONTEXT §Copy answer).
 *
 * Phase-3 minimum seed — Phase-4 (PANE-01) will extend with additional
 * source-panel header vocabulary as the corpus evolves.
 */

export const SOURCE_TITLES: Record<string, string> = {
  // KB0022991 (flagging articles) — consumer-facing
  'flagging-articles': 'Flagging Articles',
  'leaving-feedback': 'Leaving Feedback',
  'navigating-kb': 'Navigating the KB',

  // KB0020882 (author workflow) — author-facing
  'resolution': 'Resolution',
  'short-description': 'Short Description',
  'approvers': 'Approvers',
  'categories': 'Categories',
  'attachments': 'Attachments',
  'publishing': 'Publishing',

  // SNOW_FORM (field schema)
  'form-fields': 'Article Form Fields',
}

/**
 * Resolve a section_id to its human-readable title.
 * Returns `undefined` for unknown section ids — callers fall back to source_id.
 */
export function resolveSourceTitle(section_id: string): string | undefined {
  return SOURCE_TITLES[section_id]
}
