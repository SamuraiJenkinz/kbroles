---
phase: 04-source-panel-trust-and-fallback-ui
plan: 04
type: execute
wave: 3
depends_on: [04-02, 04-03]
files_modified:
  - src/grounding/__tests__/anchorIds.test.ts
  - tests-e2e/fixtures/mockChat.ts
  - tests-e2e/source-panel-first-citation.spec.ts
  - tests-e2e/source-panel-updates-and-chip-reopen.spec.ts
  - tests-e2e/source-panel-footer-and-badges.spec.ts
  - tests-e2e/fallback-and-flag-gap.spec.ts
  - tests-e2e/trust-header-and-about-tooltip.spec.ts
autonomous: true

must_haves:
  truths:
    - "Each of the 5 Phase-4 Success Criteria from ROADMAP has at least one dedicated Playwright spec that reproduces it verbatim."
    - "Pitfall 19 (anchor IDs from section markers, not heading slugs) has an automated Vitest test that iterates REGISTRY.sections and asserts ids match the SECTION_RE kebab-case pattern; and a Playwright assertion that the open panel contains `[id='<section_id>']` element for the cited section."
    - "Pitfall 20 (fallback visually distinct) has a Playwright assertion that the FallbackCard element has BOTH amber border AND amber background AND CircleOff SVG AND NO KB avatar text — three-signal invariant enforced at test time."
    - "Pitfall 16 (icon+colour pairing) has a Playwright assertion that every rendered citation chip AND the panel header badge contain a `<svg>` child alongside their `bg-<colour>-50` class."
    - "localStorage reset pattern used for the About-tooltip first-run test (`page.addInitScript` with a guard flag so reload-within-test does not re-clear)."
  artifacts:
    - path: "src/grounding/__tests__/anchorIds.test.ts"
      provides: "Vitest unit test locking section IDs to SECTION_RE kebab-case format"
      exports: []
    - path: "tests-e2e/source-panel-first-citation.spec.ts"
      provides: "SC #1 Playwright coverage"
    - path: "tests-e2e/source-panel-updates-and-chip-reopen.spec.ts"
      provides: "SC #2 Playwright coverage"
    - path: "tests-e2e/source-panel-footer-and-badges.spec.ts"
      provides: "SC #3 Playwright coverage + Pitfall 16 + Pitfall 19 E2E assertions"
    - path: "tests-e2e/fallback-and-flag-gap.spec.ts"
      provides: "SC #4 Playwright coverage + Pitfall 20 three-signal assertion"
    - path: "tests-e2e/trust-header-and-about-tooltip.spec.ts"
      provides: "SC #5 Playwright coverage + localStorage first-run pattern"
  key_links:
    - from: "tests-e2e/*.spec.ts"
      to: "tests-e2e/fixtures/mockChat.ts"
      via: "mockChatWithCitations, mockChatFallback, mockConfig, mockSources"
      pattern: "mockChatWithCitations|mockChatFallback|mockConfig|mockSources"
    - from: "src/grounding/__tests__/anchorIds.test.ts"
      to: "src/grounding/registry.ts"
      via: "REGISTRY import + iteration"
      pattern: "REGISTRY"
---

<objective>
Close Phase 4 with full E2E coverage of the 5 Success Criteria from ROADMAP §Phase 4, and automated tests for the three focus pitfalls (19, 20, 16).

Purpose: Gates phase verification. Without these tests, Phase 4 is behaviourally unverified; the planner cannot hand off to the checker/verifier agent.

Output:
- 5 Playwright specs mapping 1:1 to SC #1–#5.
- 1 Vitest unit test enforcing Pitfall 19 at CI time (registry section IDs are kebab-case anchor ids, not heading slugs).
- Fixture additions to `tests-e2e/fixtures/mockChat.ts` for the new mock surfaces: `mockConfig`, `mockSources`, `mockChatWithCitations`, `mockChatFallback`.
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
@.planning/phases/04-source-panel-trust-and-fallback-ui/04-01-source-exposure-and-badge-constants-PLAN.md
@.planning/phases/04-source-panel-trust-and-fallback-ui/04-02-source-panel-and-chip-integration-PLAN.md
@.planning/phases/04-source-panel-trust-and-fallback-ui/04-03-fallback-card-trust-header-about-tooltip-PLAN.md

# Integration points
@tests-e2e/chat-happy-path.spec.ts
@tests-e2e/fixtures/mockChat.ts
@tests-e2e/role-select.spec.ts
@src/grounding/registry.ts
@src/grounding/fallback.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Anchor-check Vitest test (Pitfall 19) + mock fixtures extension</name>
  <files>
    src/grounding/__tests__/anchorIds.test.ts,
    tests-e2e/fixtures/mockChat.ts
  </files>
  <action>
Two pieces: an always-on CI-time guard against heading-slug drift, and a fixture module extension that every E2E spec below depends on.

**1. `src/grounding/__tests__/anchorIds.test.ts`** — Pitfall 19 unit test.

```typescript
import { describe, it, expect } from 'vitest'
import { REGISTRY } from '@/grounding/registry'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

describe('Pitfall 19: section IDs are authored anchors, not heading slugs', () => {
  it('every section.id matches SECTION_RE kebab-case pattern', () => {
    for (const src of Object.values(REGISTRY)) {
      for (const s of src.sections) {
        // Anchor convention: kebab-case, starts with letter, ASCII only.
        // If this regex fails, likely someone derived the id from heading text.
        expect(s.id).toMatch(/^[a-z][a-z0-9-]*$/)
      }
    }
  })

  it('every section.id appears verbatim in its source file as <!-- section:ID -->', () => {
    // Reads the raw source files and asserts that for every registry section.id,
    // the file contains a `<!-- section:${id} -->` comment line. This proves the
    // parseSource regex extracted from authored markers rather than heading text.
    const files: Record<string, string> = {
      KB0020882: readFileSync(fileURLToPath(new URL('../sources/kb0020882.md', import.meta.url)), 'utf-8'),
      KB0022991: readFileSync(fileURLToPath(new URL('../sources/kb0022991.md', import.meta.url)), 'utf-8'),
      SNOW_FORM: readFileSync(fileURLToPath(new URL('../sources/servicenow-form.md', import.meta.url)), 'utf-8'),
    }
    for (const [srcId, src] of Object.entries(REGISTRY)) {
      const raw = files[srcId]
      for (const s of src.sections) {
        expect(raw).toContain(`<!-- section:${s.id} -->`)
      }
    }
  })

  it('section.title does NOT equal section.id (heading-slug drift guard)', () => {
    // If someone regressed parseSource to derive id from heading text, title
    // and id would collide on simple single-word headings. This asserts at
    // least one section per source has a distinct title vs id.
    for (const src of Object.values(REGISTRY)) {
      const distinct = src.sections.some(s => s.title.toLowerCase() !== s.id)
      expect(distinct).toBe(true)
    }
  })
})
```

**2. `tests-e2e/fixtures/mockChat.ts`** — extend existing fixture module. Read the current file first, then ADD (do not overwrite) the new helpers below:

```typescript
// Plan 04 additions — Phase 4 fixtures.

import type { Route, Page } from '@playwright/test'

/**
 * Intercept GET /api/config → return fixed versions + stub email.
 */
export async function mockConfig(page: Page) {
  await page.route('**/api/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        versions: { KB0022991: '13.0', KB0020882: '9.0', SNOW_FORM: '2026-04-23' },
        contentStewardEmail: 'kb-knowledge-team@mmc.com',
      }),
    }),
  )
}

/**
 * Intercept GET /api/sources?source_id=X&section_id=Y → return canned body.
 * Uses a small built-in dictionary for the sections referenced by Phase-4 specs.
 */
export async function mockSources(page: Page) {
  const SECTIONS: Record<string, { title: string; body: string; url: string; version: string }> = {
    'KB0020882/resolution-field-software': {
      title: 'Resolution Field — Software',
      body: '## Resolution Field — Software\n\nFor software tickets, the Resolution field must include:\n- Configuration Item\n- Assignment group\n- OPCO or Line of Business',
      url: 'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0020882',
      version: '9.0',
    },
    'KB0022991/flagging-articles': {
      title: 'Flagging Articles',
      body: '## Flagging Articles\n\nUse the flag button at the top-right of any KB article to report:\n- Outdated content\n- Missing information\n- Broken links',
      url: 'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0022991',
      version: '13.0',
    },
    'KB0022991/publishing-approval': {
      title: 'Publishing and Approval Workflow',
      body: '## Publishing and Approval Workflow\n\nBefore an article reaches Published state, it must pass:\n1. Author self-review\n2. Peer review\n3. Knowledge-Owner approval',
      url: 'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0022991',
      version: '13.0',
    },
  }

  await page.route('**/api/sources**', (route) => {
    const url = new URL(route.request().url())
    const sid = url.searchParams.get('source_id')
    const sec = url.searchParams.get('section_id')
    const key = `${sid}/${sec}`
    const hit = SECTIONS[key]
    if (!hit) {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unknown_section' }),
      })
      return
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ source_id: sid, section_id: sec, ...hit }),
    })
  })
}

/**
 * Intercept POST /api/chat → stream a single answer_delta + citations + done.
 * The citations arg lets each spec pick which source to cite.
 */
export async function mockChatWithCitations(
  page: Page,
  opts: { deltaText: string; citations: Array<{ source_id: string; section_id: string; quote: string }>; requestId?: string },
) {
  await page.route('**/api/chat', async (route) => {
    const requestId = opts.requestId ?? 'req-e2e-4'
    const frames = [
      `data: ${JSON.stringify({ type: 'answer_delta', text: opts.deltaText })}\n\n`,
      `data: ${JSON.stringify({ type: 'citations', citations: opts.citations })}\n\n`,
      `data: ${JSON.stringify({ type: 'done', can_answer: true, validator_flips: 0 })}\n\n`,
    ]
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Request-Id': requestId,
        'Cache-Control': 'no-store',
      },
      body: frames.join(''),
    })
  })
}

/**
 * Intercept POST /api/chat → deliver a fallback SSE event.
 */
export async function mockChatFallback(
  page: Page,
  opts: { text: string; requestId?: string },
) {
  await page.route('**/api/chat', async (route) => {
    const requestId = opts.requestId ?? 'req-e2e-fallback'
    const frame = `data: ${JSON.stringify({ type: 'fallback', reason: 'can_answer_false', text: opts.text })}\n\n`
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Request-Id': requestId,
        'Cache-Control': 'no-store',
      },
      body: frame,
    })
  })
}
```

If the existing `mockChat.ts` already defines `mockChatSuccess` / `mockPrompts`, keep them and add these NEW helpers alongside — do not remove.
  </action>
  <verify>
pnpm typecheck && pnpm test src/grounding/__tests__/anchorIds.test.ts (all three Pitfall-19 cases green).
  </verify>
  <done>
Pitfall 19 anchor-check runs at every `pnpm test` invocation. Fixture module exports `mockConfig`, `mockSources`, `mockChatWithCitations`, `mockChatFallback` for the next 4 tasks to consume.
  </done>
</task>

<task type="auto">
  <name>Task 2: Playwright specs — SC #1, SC #2, SC #3 (panel behaviour + Pitfall 19 + Pitfall 16 in E2E)</name>
  <files>
    tests-e2e/source-panel-first-citation.spec.ts,
    tests-e2e/source-panel-updates-and-chip-reopen.spec.ts,
    tests-e2e/source-panel-footer-and-badges.spec.ts
  </files>
  <action>
Three independent Playwright specs, one per SC. All use `page.addInitScript(() => { sessionStorage.clear(); localStorage.clear() })` followed by the mock fixtures.

**1. `tests-e2e/source-panel-first-citation.spec.ts` — SC #1**

```typescript
import { test, expect } from '@playwright/test'
import { mockPrompts, mockConfig, mockSources, mockChatWithCitations } from './fixtures/mockChat'

test('SC #1 — Author "Resolution field" → panel auto-opens to KB0020882 with blue badge + section body', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear()
    localStorage.setItem('about_tooltip_seen_v1', 'true')  // suppress About popover flash
  })
  await mockPrompts(page)
  await mockConfig(page)
  await mockSources(page)
  await mockChatWithCitations(page, {
    deltaText: 'The Resolution field must include Configuration Item, Assignment group, and OPCO.',
    citations: [
      { source_id: 'KB0020882', section_id: 'resolution-field-software', quote: 'Configuration Item' },
    ],
  })

  await page.goto('/')
  await page.getByRole('button', { name: /KB Author/i }).click()
  await page.getByRole('textbox').fill('What goes in the Resolution field?')
  await page.keyboard.press('Enter')

  // Answer rendered
  await expect(page.getByText(/Configuration Item, Assignment group/)).toBeVisible()

  // Panel auto-opened — Dialog with aria-labelledby source-panel-title visible
  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible()

  // Header badge shows KB0020882 with blue colour — Pitfall 16: both class AND icon
  const badge = panel.getByLabel(/Source KB0020882/)
  await expect(badge).toBeVisible()
  await expect(badge).toHaveClass(/bg-blue-50/)
  await expect(badge.locator('svg').first()).toBeVisible()

  // Body contains the section title + rendered body text
  await expect(panel.getByRole('heading', { name: /Resolution Field — Software/i })).toBeVisible()
  await expect(panel.getByText(/Assignment group/)).toBeVisible()

  // Pitfall 19: the highlighted section element has the REGISTRY section_id as DOM id
  await expect(panel.locator('#resolution-field-software')).toBeVisible()
})
```

**2. `tests-e2e/source-panel-updates-and-chip-reopen.spec.ts` — SC #2**

```typescript
import { test, expect } from '@playwright/test'
import { mockPrompts, mockConfig, mockSources } from './fixtures/mockChat'

test('SC #2 — Panel updates on follow-up citation; chip click re-opens for older message', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear()
    localStorage.setItem('about_tooltip_seen_v1', 'true')
  })
  await mockPrompts(page)
  await mockConfig(page)
  await mockSources(page)

  // First POST cites KB0020882; second POST cites KB0022991. Use a counter on route.
  let chatCallCount = 0
  await page.route('**/api/chat', async (route) => {
    chatCallCount += 1
    const frames =
      chatCallCount === 1
        ? [
            `data: ${JSON.stringify({ type: 'answer_delta', text: 'See the Resolution section.' })}\n\n`,
            `data: ${JSON.stringify({ type: 'citations', citations: [{ source_id: 'KB0020882', section_id: 'resolution-field-software', quote: 'Configuration Item' }] })}\n\n`,
            `data: ${JSON.stringify({ type: 'done', can_answer: true, validator_flips: 0 })}\n\n`,
          ]
        : [
            `data: ${JSON.stringify({ type: 'answer_delta', text: 'Publishing requires three approvals.' })}\n\n`,
            `data: ${JSON.stringify({ type: 'citations', citations: [{ source_id: 'KB0022991', section_id: 'publishing-approval', quote: 'Knowledge-Owner' }] })}\n\n`,
            `data: ${JSON.stringify({ type: 'done', can_answer: true, validator_flips: 0 })}\n\n`,
          ]
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Request-Id': 'req-e2e' },
      body: frames.join(''),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /KB Author/i }).click()
  await page.getByRole('textbox').fill('What goes in the Resolution field?')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/See the Resolution section/)).toBeVisible()
  const panel = page.getByRole('dialog')
  await expect(panel.getByRole('heading', { name: /Resolution Field/i })).toBeVisible()

  // Send a second question
  await page.getByRole('textbox').fill('Who approves articles?')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Publishing requires three approvals/)).toBeVisible()

  // Panel stayed open AND updated to new section
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading', { name: /Publishing and Approval/i })).toBeVisible()

  // Click the FIRST message's citation chip (for KB0020882/resolution-field-software)
  // Chips are buttons with aria-label containing "Open source KB0020882 —".
  await page.getByRole('button', { name: /Open source KB0020882/ }).first().click()

  // Panel re-loads the older source
  await expect(panel.getByRole('heading', { name: /Resolution Field/i })).toBeVisible()
})
```

**3. `tests-e2e/source-panel-footer-and-badges.spec.ts` — SC #3 + explicit Pitfall 16 + Pitfall 19**

```typescript
import { test, expect } from '@playwright/test'
import { mockPrompts, mockConfig, mockSources, mockChatWithCitations } from './fixtures/mockChat'

test('SC #3 — Panel footer permalink + colour-coded badges + Pitfall 16/19 invariants', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear()
    localStorage.setItem('about_tooltip_seen_v1', 'true')
  })
  await mockPrompts(page)
  await mockConfig(page)
  await mockSources(page)
  await mockChatWithCitations(page, {
    deltaText: 'Resolution details here.',
    citations: [
      { source_id: 'KB0020882', section_id: 'resolution-field-software', quote: 'Configuration Item' },
    ],
  })

  await page.goto('/')
  await page.getByRole('button', { name: /KB Author/i }).click()
  await page.getByRole('textbox').fill('resolution?')
  await page.keyboard.press('Enter')

  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible()

  // SC #3 — Footer permalink
  const permalink = panel.getByRole('link', { name: /Open in ServiceNow/i })
  await expect(permalink).toHaveAttribute(
    'href',
    'https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0020882',
  )
  await expect(permalink).toHaveAttribute('target', '_blank')
  await expect(permalink).toHaveAttribute('rel', /noopener/)

  // SC #3 — Header badge colour-coded (blue for KB0020882)
  const badge = panel.getByLabel(/Source KB0020882/)
  await expect(badge).toHaveClass(/bg-blue-50/)

  // Pitfall 16: icon + colour on EVERY colour-coded element.
  //   a) Panel header badge has colour class AND SVG child
  await expect(badge.locator('svg').first()).toBeVisible()

  //   b) Chat citation chip has colour class AND SVG child
  const chip = page.getByRole('button', { name: /Open source KB0020882/ }).first()
  await expect(chip).toHaveClass(/bg-blue-50/)
  await expect(chip.locator('svg').first()).toBeVisible()

  // Pitfall 19: section DOM id = REGISTRY section_id, NOT heading slug
  //   (heading slug of "Resolution Field — Software" would be
  //    "resolution-field-software" BY COINCIDENCE here — so assert the literal
  //    registry-authored anchor id and NOT any alternative like
  //    "resolution-field-a-software" or "resolution-field-emdash-software".)
  await expect(panel.locator('#resolution-field-software')).toBeVisible()
})
```
  </action>
  <verify>
npx playwright test tests-e2e/source-panel-first-citation.spec.ts tests-e2e/source-panel-updates-and-chip-reopen.spec.ts tests-e2e/source-panel-footer-and-badges.spec.ts (all three specs pass)
  </verify>
  <done>
SC #1 (auto-open + blue badge + body rendered + section anchor id), SC #2 (update + chip-reopen), and SC #3 (permalink + badges + Pitfall 16 E2E + Pitfall 19 E2E) all covered.
  </done>
</task>

<task type="auto">
  <name>Task 3: Playwright specs — SC #4 fallback + flag-gap (Pitfall 20 invariant) and SC #5 trust header + About tooltip (localStorage pattern)</name>
  <files>
    tests-e2e/fallback-and-flag-gap.spec.ts,
    tests-e2e/trust-header-and-about-tooltip.spec.ts
  </files>
  <action>
**1. `tests-e2e/fallback-and-flag-gap.spec.ts` — SC #4 + Pitfall 20 three-signal invariant**

```typescript
import { test, expect } from '@playwright/test'
import { mockPrompts, mockConfig, mockSources, mockChatFallback } from './fixtures/mockChat'

const FALLBACK_TEXT =
  "That information isn't in the loaded documents yet. Flag the gap to the CTSS Knowledge team via KB0022991."

test('SC #4 — Fallback card renders with three-signal distinct treatment + Flag button opens mailto', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear()
    localStorage.setItem('about_tooltip_seen_v1', 'true')
  })
  await mockPrompts(page)
  await mockConfig(page)
  await mockSources(page)
  await mockChatFallback(page, { text: FALLBACK_TEXT, requestId: 'req-test-abc' })

  await page.goto('/')
  await page.getByRole('button', { name: /Knowledge Consumer/i }).click()
  await page.getByRole('textbox').fill('What is the capital of France?')
  await page.keyboard.press('Enter')

  // Fallback region present
  const fallback = page.getByRole('region', { name: /Fallback response/i })
  await expect(fallback).toBeVisible()

  // Exact §15 copy (verbatim from server)
  await expect(fallback).toContainText(FALLBACK_TEXT)

  // Pitfall 20 three-signal invariant: border + bg + icon+bold-heading simultaneously
  //   Signal 1 — amber border class
  await expect(fallback).toHaveClass(/border-amber-400/)
  //   Signal 2 — amber background class
  await expect(fallback).toHaveClass(/bg-amber-50/)
  //   Signal 3a — CircleOff icon SVG present
  await expect(fallback.locator('svg').first()).toBeVisible()
  //   Signal 3b — bold heading present
  await expect(fallback.getByRole('heading', { level: 3 })).toHaveClass(/font-bold/)

  // Pitfall 20 — NO Message-like affordances
  await expect(fallback.getByText(/^KB$/)).toHaveCount(0)                  // no KB avatar
  await expect(fallback.locator('time')).toHaveCount(0)                    // no timestamp
  await expect(fallback.getByRole('button', { name: /helpful/i })).toHaveCount(0)   // no feedback thumbs
  await expect(fallback.getByRole('button', { name: /copy answer/i })).toHaveCount(0) // no copy

  // Flag button present + click opens mailto
  const flagBtn = fallback.getByRole('button', { name: /Flag this gap/i })
  await expect(flagBtn).toBeVisible()

  // Intercept window.location assignment via a `click` listener that reads `a.href`
  // We patch window.location.href via page.exposeFunction / evaluate capture.
  const mailtoCapture = await page.evaluateHandle(() => {
    let captured: string | null = null
    const original = Object.getOwnPropertyDescriptor(window, 'location')
    // Instead of mutating location, monkeypatch the assignment with a setter
    Object.defineProperty(window, 'location', {
      configurable: true,
      get() { return original?.get?.call(window) },
      set(value: string) { captured = value },
    })
    // @ts-expect-error attach to window for later readback
    window.__mailtoCaptured = () => captured
    return 'ready'
  })

  await flagBtn.click()

  // Readback the captured href
  const mailtoHref = await page.evaluate(() => (window as unknown as { __mailtoCaptured: () => string | null }).__mailtoCaptured())
  expect(mailtoHref).toBeTruthy()
  expect(mailtoHref!).toMatch(/^mailto:kb-knowledge-team@mmc\.com/)
  expect(decodeURIComponent(mailtoHref!)).toContain('What is the capital of France?')
  expect(decodeURIComponent(mailtoHref!)).toContain('Role: consumer')
  expect(decodeURIComponent(mailtoHref!)).toContain('Request ID: req-test-abc')
  // CRLF line separators (decodeURIComponent restores to \r\n)
  expect(decodeURIComponent(mailtoHref!)).toContain('\r\n')

  // Button label swapped
  await expect(fallback.getByRole('button', { name: /Opened in mail client/i })).toBeVisible()
})
```

Note: if the mailto-capture strategy above is unreliable on this Playwright/Chromium version, fall back to injecting a listener that intercepts the anchor click BEFORE the component calls `window.location.href = ...`. If the implementation in Plan 03 uses `window.location.href = href`, `page.on('request', ...)` won't fire because mailto URLs don't hit the network — the monkeypatch is the right approach.

**2. `tests-e2e/trust-header-and-about-tooltip.spec.ts` — SC #5 + localStorage first-run pattern**

```typescript
import { test, expect } from '@playwright/test'
import { mockPrompts, mockConfig, mockSources } from './fixtures/mockChat'

test('SC #5 — Freshness line + first-run About tooltip + dismiss persists', async ({ page }) => {
  // Clear BOTH sessionStorage AND localStorage once; the addInitScript pattern
  // from Phase 3 (Plan 03-06) uses a guard flag so page.reload() doesn't re-clear.
  await page.addInitScript(() => {
    if (typeof window === 'undefined') return
    const key = '__e2e_initialized'
    if (!(window as unknown as Record<string, unknown>)[key]) {
      sessionStorage.clear()
      localStorage.clear()
      ;(window as unknown as Record<string, unknown>)[key] = true
    }
  })
  await mockPrompts(page)
  await mockConfig(page)
  await mockSources(page)

  await page.goto('/')
  await page.getByRole('button', { name: /Knowledge Consumer/i }).click()

  // SC #5 — freshness line format (desktop viewport default in Playwright is 1280x720)
  await expect(page.getByText(
    /Grounded in KB0022991 v13\.0 · KB0020882 v9\.0 · Form schema 2026-04-23/
  )).toBeVisible()

  // SC #5 — About tooltip auto-opens on first visit
  const popover = page.getByRole('dialog', { name: /About this assistant/i })
  await expect(popover).toBeVisible()
  await expect(popover).toContainText(/What I can answer/i)
  await expect(popover).toContainText(/What I can't/i)
  await expect(popover).toContainText(/How to flag a gap/i)

  // Dismiss via "Got it"
  await popover.getByRole('button', { name: /Got it/i }).click()
  await expect(popover).not.toBeVisible()

  // Reload the page — tooltip MUST stay closed (localStorage persisted)
  await page.reload()
  // Wait for the header to re-render
  await expect(page.getByText(/Grounded in KB0022991/)).toBeVisible()
  await expect(page.getByRole('dialog', { name: /About this assistant/i })).not.toBeVisible()

  // Click ℹ icon — popover re-opens (always-available)
  await page.getByRole('button', { name: /About this assistant/i }).click()
  await expect(page.getByRole('dialog', { name: /About this assistant/i })).toBeVisible()
})
```
  </action>
  <verify>
npx playwright test tests-e2e/fallback-and-flag-gap.spec.ts tests-e2e/trust-header-and-about-tooltip.spec.ts (both specs pass)
  </verify>
  <done>
SC #4 proves exact §15 copy + three-signal Pitfall-20 invariant + mailto URL contains all four encoded fields + button-label swap. SC #5 proves freshness line format + three-bullet About popover + Got-it dismiss persists across reload + click re-opens. localStorage reset pattern mirrors Phase 3's `__e2e_initialized` guard.
  </done>
</task>

</tasks>

<verification>
- `pnpm typecheck` clean.
- `pnpm test` green (existing + anchorIds.test.ts) — verifies Pitfall 19 at unit layer.
- `npx playwright test tests-e2e/` — 14 existing E2E specs + 5 new Phase-4 specs = 19 total E2E, all green.
- Manual regression: all 5 roadmap Success Criteria pass when executed end-to-end in a fresh browser session.
- `grep -r "id=\"[a-z]" src/grounding/sources/*.md | grep -v "section:"` returns nothing (no stray id attributes masquerading as anchors in the raw markdown).
</verification>

<success_criteria>
- 5 Playwright specs — one per Phase-4 SC — exist and pass.
- Pitfall 19 covered in two layers: Vitest unit test at CI + Playwright DOM assertion at E2E.
- Pitfall 20 covered: FallbackCard test proves three visual signals present AND no Message-like affordances.
- Pitfall 16 covered: panel badge + citation chip both asserted to have colour class AND paired SVG icon.
- localStorage first-run pattern for About tooltip uses the same `__e2e_initialized` guard that Phase 3 established (no double-clearing on reload).
- Mailto URL assertion decodes and confirms all four body fields (question + role + timestamp + requestId) plus CRLF line breaks.
</success_criteria>

<output>
After completion, create `.planning/phases/04-source-panel-trust-and-fallback-ui/04-04-SUMMARY.md`, noting:
- Any Playwright v1.59.1 quirks encountered (e.g., SSE route.fulfill header behaviour, mailto capture approach).
- Exact new test counts: unit (+N for anchorIds + any others) + E2E (+5 specs).
- Any rule-3 auto-fixes needed (collision with route-announcer, strict-mode selectors).
- Whether Pitfall 19's second assertion (id contains in raw file) caught anything unexpected.
</output>
