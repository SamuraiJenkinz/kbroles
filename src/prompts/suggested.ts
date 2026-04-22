import type { Role } from '@/grounding/rolePreludes'

/**
 * Role-specific suggested-prompt chips surfaced by /api/prompts?role=...
 *
 * Source of truth: info/KB_Assistant_ClaudeCode_Handover.md §16
 * "Suggested Questions by Role" — 5 Consumer + 8 Author. Labels and texts
 * are transcribed VERBATIM; do not paraphrase without approving updates
 * upstream in the handover document.
 *
 * Chip IDs (cns-01..cns-05 / auth-01..auth-08) are stable across wording
 * edits — Phase 6 telemetry (`chip_vs_freeform` signal, roadmap Phase 6
 * SC #1) pivots on these IDs, not the label text. Bare strings would
 * force Phase 6 to hash chip text, which is fragile under wording
 * changes — so 02-CONTEXT.md §4.2 locks the `{id, label, text}` object
 * shape.
 *
 * `label` and `text` are identical in v1 — every handover-§16 question
 * is already UI-sized. The shape accommodates a future chip where the
 * UI needs a shorter label than the prompt text (e.g. "Flag article" as
 * label, full sentence as text); keep the shape even when they match.
 */
export interface ChipItem {
  id: string
  label: string
  text: string
}

export const SUGGESTED_PROMPTS: Record<Role, ChipItem[]> = {
  consumer: [
    {
      id: 'cns-01',
      label: 'How do I flag an article with wrong information?',
      text:  'How do I flag an article with wrong information?',
    },
    {
      id: 'cns-02',
      label: 'Who can edit KB articles?',
      text:  'Who can edit KB articles?',
    },
    {
      id: 'cns-03',
      label: 'How do I find articles in the Colleague Technology KB?',
      text:  'How do I find articles in the Colleague Technology KB?',
    },
    {
      id: 'cns-04',
      label: 'How do I link to a KB article correctly?',
      text:  'How do I link to a KB article correctly?',
    },
    {
      id: 'cns-05',
      label: 'What categories are articles organised into?',
      text:  'What categories are articles organised into?',
    },
  ],
  author: [
    {
      id: 'auth-01',
      label: 'What fields do I need to fill in on the form?',
      text:  'What fields do I need to fill in on the form?',
    },
    {
      id: 'auth-02',
      label: "What's the naming convention and article structure?",
      text:  "What's the naming convention and article structure?",
    },
    {
      id: 'auth-03',
      label: 'What goes in the Resolution field?',
      text:  'What goes in the Resolution field?',
    },
    {
      id: 'auth-04',
      label: 'How do I add images or attachments?',
      text:  'How do I add images or attachments?',
    },
    {
      id: 'auth-05',
      label: 'How do I create and submit a new article?',
      text:  'How do I create and submit a new article?',
    },
    {
      id: 'auth-06',
      label: 'How do I retire or delete an article?',
      text:  'How do I retire or delete an article?',
    },
    {
      id: 'auth-07',
      label: 'How do I request an article via the comms team?',
      text:  'How do I request an article via the comms team?',
    },
    {
      id: 'auth-08',
      label: 'What are the SME requirements for a submission?',
      text:  'What are the SME requirements for a submission?',
    },
  ],
}
