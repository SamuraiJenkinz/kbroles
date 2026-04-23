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
 * Single source of truth: titles are derived from SOURCE_BADGES labels
 * (src/ui/sourceBadges.ts) — the test in sourceBadges.test.ts enforces parity
 * between this map and SOURCE_BADGES.
 *
 * Phase-3 seed entries preserved; Phase-4 extended to cover all 22 sections.
 */

export const SOURCE_TITLES: Record<string, string> = {
  // ── KB0022991 (6 sections) ─────────────────────────────────────────────
  'flagging-articles':  'Flagging Articles',
  'publishing-approval': 'Publishing and Approval Workflow',
  'approvers':          'Publishing Approvers',
  'edit-retire-delete': 'Edit / Retire / Delete Lifecycle',
  'knowledge-blocks':   'Knowledge Blocks (Knowledge Team Only)',
  'criteria-check':     'Colleague Knowledge Criteria Check',

  // ── KB0020882 (9 sections) ─────────────────────────────────────────────
  'who-can-submit':                   'Who Can Submit',
  'article-creation-steps':           'Article Creation Steps',
  'naming-convention':                'Article Naming Convention',
  'required-fields':                  'Required Fields',
  'resolution-field-software':        'Resolution Field — Software (11-point)',
  'resolution-field-support-process': 'Resolution Field — Support Process (7-point)',
  'security-rules':                   'Security Rules',
  'attachments':                      'Attachments',
  'categorisation':                   'Categorisation',

  // ── SNOW_FORM (7 sections) ─────────────────────────────────────────────
  // Note: 'required-fields' is shared (KB0020882 + SNOW_FORM → same label 'Required Fields')
  'short-description':  'Short Description Field',
  'article-body':       'Article Body Field',
  'resolution-field':   'Resolution Field',
  'configuration-item': 'Configuration Item Field',
  'optional-fields':    'Optional Fields',
  'workflow-fields':    'Workflow State Fields',

  // Phase-3 legacy keys preserved for UTIL-01 backward compatibility.
  // These were seed entries that do not map to real registry section_ids;
  // kept so existing copy-suffix tests continue to pass.
  'leaving-feedback':  'Leaving Feedback',
  'navigating-kb':     'Navigating the KB',
  'resolution':        'Resolution',
  'categories':        'Categories',
  'publishing':        'Publishing',
  'form-fields':       'Article Form Fields',
}

/**
 * Resolve a section_id to its human-readable title.
 * Returns `undefined` for unknown section ids — callers fall back to source_id.
 */
export function resolveSourceTitle(section_id: string): string | undefined {
  return SOURCE_TITLES[section_id]
}
