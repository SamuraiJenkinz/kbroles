---
phase: 04-source-panel-trust-and-fallback-ui
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/config/env.ts
  - .env.example
  - src/grounding/sources/servicenow-form.md
  - src/ui/sourceBadges.ts
  - src/ui/sourceTitles.ts
  - src/ui/__tests__/sourceBadges.test.ts
  - src/app/api/sources/route.ts
  - src/app/api/sources/__tests__/route.test.ts
  - src/app/api/config/route.ts
  - src/app/api/config/__tests__/route.test.ts
autonomous: true

must_haves:
  truths:
    - "A single `SOURCE_BADGES` map keyed by `${source_id}/${section_id}` resolves every cited pair from the corpus to a colour + lucide icon + title (used by chat chip AND panel header)."
    - "`SOURCE_FALLBACK` resolves source_id to colour when section_id is not in the map; KB0022991's default is amber (per CONTEXT.md)."
    - "`CONTENT_STEWARD_EMAIL` is present in `EnvSchema` (validated zod string with default `kb-knowledge-team@mmc.com`) and surfaced to the client via `/api/config`."
    - "`GET /api/sources?source_id=X&section_id=Y` returns `{source_id, section_id, title, body, url, version}` for any valid registry pair; unknown pairs return 404."
    - "`GET /api/config` returns `{versions: {KB0022991, KB0020882, SNOW_FORM}, contentStewardEmail}` — all sourced from REGISTRY + env() server-side."
    - "servicenow-form.md `<source ...>` tag carries a dated version string (YYYY-MM-DD), NOT `live`, so the freshness line can render `Form schema 2026-04-23`."
  artifacts:
    - path: "src/ui/sourceBadges.ts"
      provides: "Canonical source_id/section_id → {colour, iconName, label} map + helpers getSourceBadge, badgeClassesFor, ringClassesFor"
      exports: ["BadgeColour", "BadgeDef", "SOURCE_BADGES", "SOURCE_FALLBACK", "getSourceBadge", "badgeClassesFor", "ringClassesFor"]
    - path: "src/app/api/sources/route.ts"
      provides: "Node runtime route returning section body content by {source_id, section_id}"
      exports: ["GET", "runtime", "dynamic"]
    - path: "src/app/api/config/route.ts"
      provides: "Node runtime route returning registry versions + Content Steward email"
      exports: ["GET", "runtime", "dynamic"]
    - path: "src/config/env.ts"
      provides: "EnvSchema with CONTENT_STEWARD_EMAIL"
      contains: "CONTENT_STEWARD_EMAIL"
  key_links:
    - from: "src/app/api/sources/route.ts"
      to: "src/grounding/registry.ts"
      via: "REGISTRY lookup"
      pattern: "REGISTRY\\["
    - from: "src/app/api/config/route.ts"
      to: "src/grounding/registry.ts + src/config/env.ts"
      via: "versions + email"
      pattern: "REGISTRY\\..*\\.version|env\\(\\)"
---

<objective>
Lock the architectural foundation for Phase 4: a single source-of-truth `sourceBadges.ts` constant (colour + icon + title) that every citation chip and panel header reads, client-safe HTTP access to source content (the REGISTRY uses `readFileSync` at module init, so cannot be imported in client components), and environment variable wiring for the Content Steward email.

Purpose: Plans 02–04 depend on these three artifacts. Until the badge constant exists, chip colour-coding cannot be implemented; until `/api/sources` exists, the panel cannot render section bodies without crashing the client bundle; until `CONTENT_STEWARD_EMAIL` is in the env schema, the flag-a-gap mailto has no recipient.

Output:
- `src/ui/sourceBadges.ts` — canonical `${source_id}/${section_id}` → {colour, iconName, label} map + helpers (single source of truth).
- `src/ui/sourceTitles.ts` — extended to cover every section_id in the registry.
- `src/app/api/sources/route.ts` — `GET /api/sources?source_id=X&section_id=Y` → section body JSON.
- `src/app/api/config/route.ts` — `GET /api/config` → versions + content steward email.
- `src/config/env.ts` — `CONTENT_STEWARD_EMAIL` added to EnvSchema.
- `.env.example` — placeholder `CONTENT_STEWARD_EMAIL=kb-knowledge-team@mmc.com` added.
- `src/grounding/sources/servicenow-form.md` — `version="live"` replaced with `version="2026-04-23"` so freshness line reads `Form schema 2026-04-23`.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/04-source-panel-trust-and-fallback-ui/04-CONTEXT.md
@.planning/phases/04-source-panel-trust-and-fallback-ui/04-RESEARCH.md

# Integration points
@src/grounding/registry.ts
@src/grounding/sources/kb0022991.md
@src/grounding/sources/kb0020882.md
@src/grounding/sources/servicenow-form.md
@src/config/env.ts
@.env.example
@src/ui/sourceTitles.ts
@src/app/api/prompts/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Canonical badge map + sourceTitles extension</name>
  <files>
    src/ui/sourceBadges.ts,
    src/ui/sourceTitles.ts,
    src/ui/__tests__/sourceBadges.test.ts
  </files>
  <action>
Create `src/ui/sourceBadges.ts` — the canonical `(source_id, section_id) → {colour, iconName, label}` map used by BOTH the chat citation chip and the panel header. ONE source of truth prevents drift.

**Types to export:**
```typescript
export type BadgeColour = 'blue' | 'red' | 'green' | 'purple' | 'amber'

export interface BadgeDef {
  colour: BadgeColour
  iconName: 'Flag' | 'Upload' | 'Paperclip' | 'Tags' | 'FileText' | 'ClipboardList'
  label: string
}
```

**Canonical map** (from RESEARCH §Canonical Section → Colour Map). Key format: `` `${source_id}/${section_id}` `` — the slash separator prevents collision between `KB0020882/required-fields` and `SNOW_FORM/required-fields`.

```typescript
export const SOURCE_BADGES: Record<string, BadgeDef> = {
  // KB0022991 — Flagging (red)
  'KB0022991/flagging-articles':   { colour: 'red',    iconName: 'Flag',          label: 'Flagging Articles' },

  // KB0022991 — Publishing/Lifecycle (green)
  'KB0022991/publishing-approval': { colour: 'green',  iconName: 'Upload',        label: 'Publishing and Approval Workflow' },
  'KB0022991/approvers':           { colour: 'green',  iconName: 'Upload',        label: 'Publishing Approvers' },
  'KB0022991/edit-retire-delete':  { colour: 'green',  iconName: 'Upload',        label: 'Edit / Retire / Delete Lifecycle' },
  'KB0022991/knowledge-blocks':    { colour: 'green',  iconName: 'Upload',        label: 'Knowledge Blocks' },
  'KB0022991/criteria-check':      { colour: 'green',  iconName: 'Upload',        label: 'Colleague Knowledge Criteria Check' },

  // KB0020882 — source-level blue (all 9 sections; attachments stays blue per RESEARCH §78)
  'KB0020882/who-can-submit':                    { colour: 'blue', iconName: 'FileText',  label: 'Who Can Submit' },
  'KB0020882/article-creation-steps':            { colour: 'blue', iconName: 'FileText',  label: 'Article Creation Steps' },
  'KB0020882/naming-convention':                 { colour: 'blue', iconName: 'FileText',  label: 'Article Naming Convention' },
  'KB0020882/required-fields':                   { colour: 'blue', iconName: 'FileText',  label: 'Required Fields' },
  'KB0020882/resolution-field-software':         { colour: 'blue', iconName: 'FileText',  label: 'Resolution Field — Software' },
  'KB0020882/resolution-field-support-process':  { colour: 'blue', iconName: 'FileText',  label: 'Resolution Field — Support Process' },
  'KB0020882/security-rules':                    { colour: 'blue', iconName: 'FileText',  label: 'Security Rules' },
  'KB0020882/attachments':                       { colour: 'blue', iconName: 'Paperclip', label: 'Attachments' },
  'KB0020882/categorisation':                    { colour: 'amber', iconName: 'Tags',     label: 'Categorisation' },

  // SNOW_FORM — source-level purple (all 7 sections)
  'SNOW_FORM/required-fields':     { colour: 'purple', iconName: 'ClipboardList', label: 'Required Fields' },
  'SNOW_FORM/short-description':   { colour: 'purple', iconName: 'ClipboardList', label: 'Short Description Field' },
  'SNOW_FORM/article-body':        { colour: 'purple', iconName: 'ClipboardList', label: 'Article Body Field' },
  'SNOW_FORM/resolution-field':    { colour: 'purple', iconName: 'ClipboardList', label: 'Resolution Field' },
  'SNOW_FORM/configuration-item':  { colour: 'purple', iconName: 'ClipboardList', label: 'Configuration Item Field' },
  'SNOW_FORM/optional-fields':     { colour: 'purple', iconName: 'ClipboardList', label: 'Optional Fields' },
  'SNOW_FORM/workflow-fields':     { colour: 'purple', iconName: 'ClipboardList', label: 'Workflow State Fields' },
}

// Source-level fallback when section_id is not in SOURCE_BADGES
export const SOURCE_FALLBACK: Record<string, {colour: BadgeColour, iconName: BadgeDef['iconName']}> = {
  KB0020882: { colour: 'blue',   iconName: 'FileText' },
  KB0022991: { colour: 'amber',  iconName: 'Tags' },   // default for uncovered KB0022991 sections
  SNOW_FORM: { colour: 'purple', iconName: 'ClipboardList' },
}
```

**Helper exports:**

```typescript
export function getSourceBadge(source_id: string, section_id: string): BadgeDef {
  const exact = SOURCE_BADGES[`${source_id}/${section_id}`]
  if (exact) return exact
  const fallback = SOURCE_FALLBACK[source_id] ?? { colour: 'amber', iconName: 'FileText' }
  return { ...fallback, label: section_id } // degrade label to raw id for unknown sections
}

// Tailwind class families — Pitfall 16: colour NEVER appears alone without icon.
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

export const badgeClassesFor = (c: BadgeColour) => BADGE_CLASSES[c]
export const ringClassesFor  = (c: BadgeColour) => RING_CLASSES[c]
```

**Extend `src/ui/sourceTitles.ts`:** update `SOURCE_TITLES` to contain EVERY section_id from all three sources (22 total). Preserve existing API (Record<string, string> + resolveSourceTitle function). Source the titles from the `label` values above (single source of truth — the test below enforces parity).

**Create `src/ui/__tests__/sourceBadges.test.ts`** covering:
1. **Pitfall 16 invariant — every map entry has BOTH colour AND iconName:** iterate `Object.values(SOURCE_BADGES)`; assert `entry.colour` is defined AND `entry.iconName` is defined AND `entry.label` is defined.
2. **Registry parity test:** import `REGISTRY` from `@/grounding/registry`; for every `(source_id, section_id)` pair in the registry, assert `getSourceBadge(source_id, section_id)` returns a BadgeDef whose label matches REGISTRY section title (guarantees no section_id drifts between sources and badges).
3. **Fallback behaviour:** `getSourceBadge('KB0022991', 'nonexistent-section')` returns `{colour: 'amber', iconName: 'Tags', label: 'nonexistent-section'}`.
4. **Source-level fallback:** `getSourceBadge('KB0020882', 'nonexistent-section')` returns `{colour: 'blue', ...}`.
5. **resolveSourceTitle parity:** every section_id in REGISTRY returns a non-undefined title via resolveSourceTitle.
  </action>
  <verify>
pnpm typecheck (must pass) && pnpm test src/ui/__tests__/sourceBadges.test.ts (all test cases green)
  </verify>
  <done>
Tests pass. `SOURCE_BADGES` covers all 22 section_ids in the registry. Every entry has colour + icon + label. Pitfall 16 invariant proven by the iteration test.
  </done>
</task>

<task type="auto">
  <name>Task 2: Env schema + servicenow-form version + API routes (/api/sources, /api/config)</name>
  <files>
    src/config/env.ts,
    .env.example,
    src/grounding/sources/servicenow-form.md,
    src/app/api/sources/route.ts,
    src/app/api/sources/__tests__/route.test.ts,
    src/app/api/config/route.ts,
    src/app/api/config/__tests__/route.test.ts
  </files>
  <action>
Three linked changes — env var wiring, dated SNOW_FORM version, and two new read-only API routes.

**1. `src/config/env.ts`** — append to EnvSchema (after UPSTREAM_RETRY_JITTER_MS):

```typescript
// Phase-4 Content Steward mailbox (FBK-04).
// Placeholder today — Phase 6 pilot prep names the real named mailbox.
// z.string().email() is too strict (accepts Exchange distribution list DNs
// only when formatted as user@domain.tld). Use z.string().min(1) with a
// runtime regex check that at least an @ appears.
CONTENT_STEWARD_EMAIL: z.string().min(1).regex(/@/).optional().default('kb-knowledge-team@mmc.com'),
```

**2. `.env.example`** — add a block at the end of the file:

```
# Phase-4 Content Steward mailbox (FBK-04).
# Placeholder today — Phase 6 pilot prep names the real named mailbox.
CONTENT_STEWARD_EMAIL=kb-knowledge-team@mmc.com
```

**3. `src/grounding/sources/servicenow-form.md`** — change the first line:

FROM: `<source id="SNOW_FORM" title="..." version="live" url="...">`
TO:   `<source id="SNOW_FORM" title="..." version="2026-04-23" url="...">`

Rationale: freshness line format `Form schema YYYY-MM-DD` requires a dated version string. The registry's `parseSource` extracts the `version` attribute verbatim — no other code needs changing.

**4. `src/app/api/sources/route.ts`** — client-safe source-content surface. The REGISTRY uses `readFileSync` at module init and cannot be imported in client components (RESEARCH §Anti-Patterns); this route wraps it so panel body content can be fetched client-side.

```typescript
/**
 * GET /api/sources?source_id=X&section_id=Y
 *
 * Phase-4 client-safe source content surface. The REGISTRY module reads
 * files synchronously at init (server-only). The Source Panel (Plan 02)
 * fetches section bodies via this route instead of importing REGISTRY.
 *
 * Contract:
 *   - Missing source_id | section_id → 400 {error:'missing_params'}
 *   - Unknown source_id              → 404 {error:'unknown_source'}
 *   - Unknown section_id             → 404 {error:'unknown_section'}
 *   - Valid pair                     → 200 {source_id, section_id, title, body, url, version}
 *
 * Caching: public, max-age=3600 (sources change on redeploy only — safe to
 * cache on shared proxy for an hour).
 */
import { REGISTRY } from '@/grounding/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'  // same reason as /api/prompts: query-string-keyed body

const ALLOWED_SOURCES = ['KB0020882', 'KB0022991', 'SNOW_FORM'] as const

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const source_id = searchParams.get('source_id')
  const section_id = searchParams.get('section_id')

  if (!source_id || !section_id) {
    return Response.json({ error: 'missing_params' }, { status: 400 })
  }
  if (!ALLOWED_SOURCES.includes(source_id as (typeof ALLOWED_SOURCES)[number])) {
    return Response.json({ error: 'unknown_source', allowed: ALLOWED_SOURCES }, { status: 404 })
  }

  const src = REGISTRY[source_id as keyof typeof REGISTRY]
  const section = src.sections.find(s => s.id === section_id)
  if (!section) {
    return Response.json({ error: 'unknown_section' }, { status: 404 })
  }

  return Response.json(
    {
      source_id,
      section_id,
      title: section.title,
      body: section.body,
      url: src.url,
      version: src.version,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        Vary: 'Accept-Encoding',
      },
    },
  )
}
```

**5. `src/app/api/config/route.ts`** — freshness header source of truth.

```typescript
/**
 * GET /api/config — Phase-4 trust/freshness data + non-secret UI constants.
 *
 * Returns:
 *   - versions: REGISTRY source versions (for TRST-01 freshness line)
 *   - contentStewardEmail: recipient for FBK-04 mailto (non-secret)
 *
 * Sourced server-side from REGISTRY + env(). Same runtime + cache pattern
 * as /api/prompts.
 */
import { REGISTRY } from '@/grounding/registry'
import { env } from '@/config/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  return Response.json(
    {
      versions: {
        KB0022991: REGISTRY.KB0022991.version,
        KB0020882: REGISTRY.KB0020882.version,
        SNOW_FORM: REGISTRY.SNOW_FORM.version,
      },
      contentStewardEmail: env().CONTENT_STEWARD_EMAIL,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        Vary: 'Accept-Encoding',
      },
    },
  )
}
```

**6. Tests for both routes:**

- `src/app/api/sources/__tests__/route.test.ts`: missing params → 400; unknown source → 404; unknown section → 404; valid KB0020882/resolution-field-software → 200 with non-empty body and correct url; response headers include Cache-Control.
- `src/app/api/config/__tests__/route.test.ts`: versions match `REGISTRY.*.version`; `contentStewardEmail` defaults to `kb-knowledge-team@mmc.com` when env var absent (use `vi.resetModules()` + `__resetEnvCacheForTests()`); response headers include Cache-Control.

Follow the existing `/api/prompts/__tests__/route.test.ts` test pattern exactly (direct `GET(new Request('http://localhost/...'))` calls, no supertest, no next/test-utils).
  </action>
  <verify>
pnpm typecheck (must pass) && pnpm test src/config/__tests__/env.test.ts src/app/api/sources src/app/api/config (all green)
  </verify>
  <done>
EnvSchema accepts CONTENT_STEWARD_EMAIL with the documented default. servicenow-form.md version = `2026-04-23`. `/api/sources?source_id=KB0020882&section_id=resolution-field-software` returns 200 JSON with non-empty `body`. `/api/config` returns 200 JSON with all three versions + contentStewardEmail. All new route tests green.
  </done>
</task>

</tasks>

<verification>
- `pnpm typecheck` clean.
- `pnpm test` green (all existing tests remain green + new tests in src/ui/__tests__/sourceBadges.test.ts + src/app/api/sources + src/app/api/config).
- `curl http://localhost:3000/api/sources?source_id=KB0020882&section_id=resolution-field-software` returns 200 with `body` containing non-empty markdown.
- `curl http://localhost:3000/api/config` returns 200 with `{versions:{KB0022991,KB0020882,SNOW_FORM}, contentStewardEmail}`.
- Grep `version="` in src/grounding/sources/servicenow-form.md returns a date in YYYY-MM-DD format, NOT `live`.
- Pitfall 16 invariant test passes: no SOURCE_BADGES entry lacks colour or iconName.
</verification>

<success_criteria>
- `src/ui/sourceBadges.ts` exports `SOURCE_BADGES`, `SOURCE_FALLBACK`, `getSourceBadge`, `badgeClassesFor`, `ringClassesFor` — single source of truth for Plans 02 + 03.
- `/api/sources` returns section body content; `/api/config` returns versions + contentStewardEmail — Plans 02 + 03 can fetch both without crashing on REGISTRY readFileSync.
- `CONTENT_STEWARD_EMAIL` is validated in EnvSchema with a default — Plan 03's mailto builder will never encounter undefined.
- SNOW_FORM version is dated — Plan 03's freshness line can render `Form schema 2026-04-23` directly.
- Test parity proves that every REGISTRY section_id has a SOURCE_BADGES entry — drift prevented at CI time.
</success_criteria>

<output>
After completion, create `.planning/phases/04-source-panel-trust-and-fallback-ui/04-01-SUMMARY.md` following the summary template, noting:
- Any decision made about the `KB0020882/attachments` colour override (current plan: stays blue per RESEARCH §78; override to purple only if handover §14 is revisited).
- Any decision made about a different SNOW_FORM version string (current plan: `2026-04-23`; could be the git-hash date of last source edit).
- Exact test count delta and pnpm test total.
</output>
