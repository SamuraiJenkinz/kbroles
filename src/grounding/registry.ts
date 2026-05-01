import type { SourceId } from '@/grounding/schema'

// .md files are loaded as raw strings at build time via static imports.
// Webpack's `asset/source` rule and Turbopack's `{ type: 'raw' }` rule
// (both in `next.config.ts`) handle the Next.js bundles, inlining the
// markdown content as a string module with no runtime fs access needed.
// Vitest uses the `rawMarkdown` plugin in `vitest.config.mts` to do the
// same for unit tests. tsx (pnpm smoke) uses the loader hook registered
// by `--import ./scripts/md-loader.mjs` in the smoke script entry in
// package.json. No runtime readFileSync; no host-specific absolute paths.
import kb0020882Raw from './sources/kb0020882.md'
import kb0022991Raw from './sources/kb0022991.md'
import snowFormRaw from './sources/servicenow-form.md'

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
