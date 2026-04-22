import { readFileSync } from 'node:fs'
import type { SourceId } from '@/grounding/schema'

// Source markdown is loaded via readFileSync at module init (server-only).
// The original `import X from './sources/X.md'` pattern worked in Vitest (custom
// raw-markdown Vite plugin) and Next.js (Turbopack `{ type: 'raw' }` + webpack
// `asset/source` rule) but broke under plain tsx, which has no `.md` loader.
// readFileSync + import.meta.url is portable across tsx, Vitest, Node, and
// Next.js server code — all of which is this module's only caller surface.
const readSource = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), 'utf-8')

const kb0020882Raw = readSource('./sources/kb0020882.md')
const kb0022991Raw = readSource('./sources/kb0022991.md')
const snowFormRaw  = readSource('./sources/servicenow-form.md')

export type { SourceId } from '@/grounding/schema'

export interface Section {
  id: string
  title: string
  body: string
}

export interface Source {
  id: SourceId
  title: string
  version: string
  url: string
  sections: Section[]
}

export type Registry = Record<SourceId, Source>

const SOURCE_TAG_RE =
  /<source\s+id="([^"]+)"\s+title="([^"]+)"\s+version="([^"]+)"\s+url="([^"]+)"\s*>/

export function parseSource(raw: string): Source {
  // SECTION_RE is declared INSIDE parseSource (not at module scope).
  // A shared /g regex carries `lastIndex` between calls, which is safe for
  // sequential invocations but breaks under concurrent usage (e.g.
  // Promise.all([parseSource(a), parseSource(b)])) and surprises future
  // maintainers. Declaring it locally sidesteps both issues; the per-call
  // allocation cost is negligible (3 calls at module load + test calls).
  const SECTION_RE =
    /<!--\s*section:([\w-]+)\s*-->\s*\n([\s\S]*?)(?=<!--\s*section:|<\/source>|$)/g

  const tagMatch = raw.match(SOURCE_TAG_RE)
  if (!tagMatch) {
    throw new Error('Missing or malformed <source ...> opening tag (must be on single line)')
  }
  const [, id, title, version, url] = tagMatch

  // Strip wrapper
  const afterOpen = raw.replace(/^[\s\S]*?<source[^>]*>/, '')
  const inner = afterOpen.replace(/<\/source>[\s\S]*$/, '')

  const sections: Section[] = []
  let m: RegExpExecArray | null
  while ((m = SECTION_RE.exec(inner)) !== null) {
    const sectionId = m[1]
    const rawBody = m[2].trim()
    const headingMatch = rawBody.match(/^##\s+(.+)$/m)
    const sectionTitle = headingMatch ? headingMatch[1].trim() : sectionId
    sections.push({ id: sectionId, title: sectionTitle, body: rawBody })
  }

  if (sections.length === 0) {
    throw new Error(`Source ${id} has no <!-- section:ID --> anchors`)
  }

  return { id: id as SourceId, title, version, url, sections }
}

const kb0020882 = parseSource(kb0020882Raw)
const kb0022991 = parseSource(kb0022991Raw)
const snowForm  = parseSource(snowFormRaw)

export const REGISTRY: Registry = {
  KB0020882: kb0020882,
  KB0022991: kb0022991,
  SNOW_FORM: snowForm,
}

// Sanity check at module load — fail fast if the raw files drift
if (kb0020882.id !== 'KB0020882') throw new Error(`kb0020882.md has id=${kb0020882.id}`)
if (kb0022991.id !== 'KB0022991') throw new Error(`kb0022991.md has id=${kb0022991.id}`)
if (snowForm.id !== 'SNOW_FORM')  throw new Error(`servicenow-form.md has id=${snowForm.id}`)
