---
phase: 3
plan: 6
name: e2e-success-criteria
type: execute
wave: 4
depends_on: [1, 2, 3, 4, 5]
files_modified:
  - tests-e2e/role-select.spec.ts
  - tests-e2e/chat-happy-path.spec.ts
  - tests-e2e/controls-stop-new-change.spec.ts
  - tests-e2e/keyboard-and-error-retry.spec.ts
  - tests-e2e/copy-and-feedback.spec.ts
  - tests-e2e/role-contamination.spec.ts
  - tests-e2e/fixtures/mockChat.ts
  - package.json
autonomous: true

must_haves:
  truths:
    - "Playwright E2E suite proves Phase-3 SC #1 (role-select → role-aware greeting + correct chip count) in a live browser"
    - "Playwright proves SC #2 (chip click → typing dots → streaming answer with avatar + timestamp + thumbs pair)"
    - "Playwright proves SC #3 (Stop cancels cleanly + New conversation clears without changing role + Change role confirm clears + returns to RoleSelect)"
    - "Playwright proves SC #4 (Enter submits / Shift+Enter newline; a 5xx server response from /api/chat yields an ErrorCard with Retry button that re-sends successfully)"
    - "Playwright proves SC #5 (Copy button puts '<body>\\n\\n(Source: KB0022991 · Flagging Articles)' in the clipboard; 👎 opens the 4-option radio group with zero free-text inputs)"
    - "Playwright regression test for Pitfall 13 (change role mid-stream): start a long-running stream, click Change role mid-stream, pick the OTHER role, send a new message — the new bubble contains ONLY the new role's answer with ZERO text leaked from the aborted stream"
    - "Playwright regression test for Pitfall 17 (refresh preserves DRAFT only, not history): type a draft, refresh the page, draft is restored; send a message, refresh, messages are wiped but role persists"
    - "All specs run against `pnpm dev` on localhost:3000 (webServer is defined in playwright.config.ts from Plan 01)"
    - "Chat fetches are intercepted via Playwright route mocking so E2E runs don't need real MGTI access; the intercepts emit valid SSE framed text matching docs/api-chat-contract.md §3 exactly"
    - "Test scripts added to package.json: `pnpm test:e2e` runs the full suite; scripts do not break `pnpm test` (unit) which stays Vitest-only"
  artifacts:
    - path: "tests-e2e/fixtures/mockChat.ts"
      provides: "Playwright route handlers that emit framed SSE to /api/chat; factory functions for happy/fallback/error/slow streams; also a mock for /api/prompts"
      exports: ["mockChatSuccess", "mockChatFallback", "mockChatError", "mockChatSlow", "mockPrompts"]
      min_lines: 80
    - path: "tests-e2e/role-select.spec.ts"
      provides: "SC #1 — role-select shows both cards, pick flows load correct chip counts"
    - path: "tests-e2e/chat-happy-path.spec.ts"
      provides: "SC #2 — chip click → typing dots → streaming text → citation + controls + timestamp"
    - path: "tests-e2e/controls-stop-new-change.spec.ts"
      provides: "SC #3 — Stop/New/Change + Pitfall 13 (mid-stream change)"
    - path: "tests-e2e/keyboard-and-error-retry.spec.ts"
      provides: "SC #4 — Enter/Shift+Enter + error card + Retry"
    - path: "tests-e2e/copy-and-feedback.spec.ts"
      provides: "SC #5 — Copy exact suffix + 👎 four-option radio + no free-text"
    - path: "tests-e2e/role-contamination.spec.ts"
      provides: "Pitfall 4 / 13 — mid-stream role swap does not leak old-role text into new bubble; Pitfall 17 — draft-only persistence on refresh"
  key_links:
    - from: "tests-e2e/*.spec.ts"
      to: "playwright.config.ts"
      via: "testDir points here; webServer runs `pnpm dev`"
      pattern: "testDir"
    - from: "tests-e2e/fixtures/mockChat.ts"
      to: "docs/api-chat-contract.md"
      via: "emitted SSE frames mirror §3 event schema exactly (type + payload shape)"
      pattern: "answer_delta|citations|fallback|done|error"
    - from: "tests-e2e/copy-and-feedback.spec.ts"
      to: "src/ui/sourceTitles.ts"
      via: "asserts copied text contains 'Flagging Articles' — the resolved title for section_id 'flagging-articles'"
      pattern: "Flagging Articles"
---

<objective>
Close Phase 3 with browser-level proof of all five Success Criteria plus dedicated regression tests for Pitfall 13 (change-role mid-stream) and Pitfall 17 (refresh preserves draft-only, never message history). Playwright drives a real Chromium instance against `pnpm dev`; `/api/chat` and `/api/prompts` are route-mocked via `page.route` so the suite runs deterministically without MGTI access.

Purpose: unit tests from Plans 02–05 cover the logic. E2E tests cover the **integration** — that Radix portals render correctly, that Tailwind utilities produce visible styling, that sessionStorage actually round-trips through a real browser, and that the stop/clear/change-role ordering works when the network is real-ish.

Output: 6 spec files + 1 shared mock fixture + a test:e2e script addition.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Depends on every prior plan:
- Plan 01 — Playwright installed, playwright.config.ts with webServer targeting `pnpm dev`.
- Plan 02–05 — the app under test.

Before starting, read:

@.planning/phases/03-role-experience-and-chat-ui/03-RESEARCH.md  (§Supporting libraries Playwright; §Common Pitfalls 1/2/3 — E2E mitigations)
@.planning/phases/03-role-experience-and-chat-ui/03-CONTEXT.md  (§Primary controls — locked test scenarios; §Copy answer UTIL-01 — exact copy string; §Thumbs 👍/👎 — 4-option radio)
@docs/api-chat-contract.md  (§3 event schema — authoritative frame shapes to emit from the mock; §2 response headers — X-Request-Id, text/event-stream content-type, X-Accel-Buffering:no)

@playwright.config.ts       (Plan 01 — webServer + baseURL)

**Playwright route mocking pattern (LOCKED):**

```ts
// Mock /api/chat with an SSE stream. We feed chunks via a ReadableStream body so Playwright pipes them as-is.
import type { Route } from '@playwright/test'

export async function mockChatSuccess(route: Route, opts?: { deltaText?: string }) {
  const body = [
    `data: ${JSON.stringify({ type: 'answer_delta', text: opts?.deltaText ?? 'You can flag an article by clicking the flag icon in the article header.' })}\n\n`,
    `data: ${JSON.stringify({ type: 'citations', citations: [{ source_id: 'KB0022991', section_id: 'flagging-articles', quote: 'Click the flag icon' }] })}\n\n`,
    `data: ${JSON.stringify({ type: 'done', can_answer: true, validator_flips: 0 })}\n\n`,
  ].join('')
  await route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Request-Id': 'e2e-req-' + crypto.randomUUID().slice(0, 8),
    },
    body,
  })
}
```

Playwright's `route.fulfill` accepts a string body; the browser reads it as a whole response. For SSE frame-parsing robustness tests, use chunked bodies via route.fetch OR accept that E2E is not the level to test partial-frame buffering (that's Plan 03's unit test responsibility).

**/api/prompts mock (LOCKED):**

```ts
export async function mockPrompts(page: Page) {
  await page.route('**/api/prompts?role=consumer', route =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
      body: JSON.stringify({
        role: 'consumer',
        prompts: [
          { id: 'cns-01', label: 'How do I flag an article?', text: 'How do I flag an article in the KB?' },
          { id: 'cns-02', label: 'How do I leave feedback?', text: 'How do I leave feedback on a KB article?' },
          { id: 'cns-03', label: 'Where do I find article X?', text: 'How do I find a specific KB article?' },
          { id: 'cns-04', label: 'How do I navigate the KB?', text: 'What are the main sections of the KB?' },
          { id: 'cns-05', label: 'What do I do if info is wrong?', text: 'What should I do if an article has incorrect info?' },
        ],
      }),
    }),
  )
  await page.route('**/api/prompts?role=author', route =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'author',
        prompts: Array.from({ length: 8 }, (_, i) => ({
          id: `auth-0${i + 1}`,
          label: `Author chip ${i + 1}`,
          text: `Tell me about author topic ${i + 1}`,
        })),
      }),
    }),
  )
}
```

**SC mapping (1–5 from ROADMAP.md §Phase 3):**

| SC | Spec file | Scenario |
|----|-----------|----------|
| 1 | role-select.spec.ts | Landing shows 2 cards; consumer pick → greeting + 5 chips; author pick → 8 chips |
| 2 | chat-happy-path.spec.ts | Author chip click → typing dots → streaming answer → citation pill + timestamp + 👍/👎 |
| 3 | controls-stop-new-change.spec.ts | Stop mid-stream; New conversation clears without role change; Change role → confirm → RoleSelect; mid-stream Change (Pitfall 13) |
| 4 | keyboard-and-error-retry.spec.ts | Enter sends; Shift+Enter newline; simulated 5xx → ErrorCard → Retry succeeds |
| 5 | copy-and-feedback.spec.ts | Copy writes exact UTIL-01 string to clipboard; 👎 opens 4-option radio with NO textarea/input-text inside |

**Pitfalls 4/13/17 → role-contamination.spec.ts.**

**Anti-patterns to avoid:**
- Do NOT rely on real /api/chat going out to MGTI — always mock via page.route. E2E must be hermetic.
- Do NOT use Playwright's built-in `page.fill` or `press('Enter')` with wrong selector specificity — use `getByRole` / `getByLabel` so tests survive refactors.
- Do NOT use fixed `waitFor` timeouts — use `toBeVisible`, `toHaveText`, `toContainText` with Playwright's auto-waits.
- Do NOT attempt clipboard assertions via `navigator.clipboard.readText()` without granting clipboard permissions to the browser context (`browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })`). The copy-format spec MUST request this permission.
</context>

<tasks>

<task type="auto">
  <name>Task 6.1: Shared mock fixture + SC#1 (RoleSelect) + SC#2 (chat happy path)</name>
  <files>tests-e2e/fixtures/mockChat.ts, tests-e2e/role-select.spec.ts, tests-e2e/chat-happy-path.spec.ts, package.json</files>
  <action>
    1. **Create `tests-e2e/fixtures/mockChat.ts`** exposing the helpers referenced in `<context>` plus variants:
       - `mockChatSuccess(route, opts?)` — one answer_delta + citations + done.
       - `mockChatFallback(route, opts?)` — one fallback{reason:'can_answer_false', text:'<§15 fallback copy>'}.
       - `mockChatError(route, opts?)` — one error{code:'upstream_5xx', message:'upstream 503'}.
       - `mockChatSlow(route)` — emits an initial answer_delta then NEVER closes (for Stop + Change-role mid-stream tests). Use `ReadableStream` with no controller.close() so the response stays open until aborted.
       - `mockPrompts(page)` — the two prompts endpoints above.
       - Each helper has a 1-line JSDoc pointing back to `docs/api-chat-contract.md` §3.

       Structure the helpers so each returns either a `route.fulfill` call or a nested `page.route` registration (for multi-request tests, expose a setup function that accepts `page` and a sequence of responses).

       For the slow/aborted case, use a streamed response:
       ```ts
       export async function mockChatSlow(route: Route) {
         const encoder = new TextEncoder()
         const rs = new ReadableStream({
           start(controller) {
             controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'answer_delta', text: 'Start of a long answer… ' })}\n\n`))
             // Intentionally never close — the test's abort closes it.
           },
         })
         await route.fulfill({
           status: 200,
           headers: {
             'Content-Type': 'text/event-stream; charset=utf-8',
             'X-Accel-Buffering': 'no',
             'X-Request-Id': 'e2e-slow-' + Date.now(),
           },
           body: rs as unknown as Buffer,   // Playwright accepts streams via fulfill body
         })
       }
       ```

       If Playwright's fulfill doesn't accept a streaming body in the installed version, fall back to a "chunked via multiple route handlers" approach: route the first hit to return one answer_delta, then on subsequent `abort` signal in the test assert the fetch was cancelled. Document whichever approach is used.

    2. **Create `tests-e2e/role-select.spec.ts`** (SC #1):
       ```ts
       import { test, expect } from '@playwright/test'
       import { mockPrompts } from './fixtures/mockChat'

       test.describe('SC #1 — Role select landing', () => {
         test.beforeEach(async ({ page }) => {
           await mockPrompts(page)
         })

         test('shows two role cards on first visit', async ({ page }) => {
           await page.goto('/')
           await expect(page.getByRole('button', { name: /Knowledge Consumer/i })).toBeVisible()
           await expect(page.getByRole('button', { name: /KB Author/i })).toBeVisible()
         })

         test('consumer pick → greeting + 5 chips', async ({ page }) => {
           await page.goto('/')
           await page.getByRole('button', { name: /Knowledge Consumer/i }).click()
           await expect(page.getByText(/flagging articles, leaving feedback/i)).toBeVisible()
           await expect(page.getByRole('listitem')).toHaveCount(5)   // chip row
         })

         test('author pick → greeting + 8 chips', async ({ page }) => {
           await page.goto('/')
           await page.getByRole('button', { name: /KB Author/i }).click()
           await expect(page.getByText(/authoring and publishing articles/i)).toBeVisible()
           await expect(page.getByRole('listitem')).toHaveCount(8)
         })

         test('returning user (sessionStorage seeded) skips role-select', async ({ page, context }) => {
           // Seed sessionStorage by opening root once and setting the key, then reload
           await page.goto('/')
           await page.evaluate(() => sessionStorage.setItem('kbroles.role', 'author'))
           await page.reload()
           await expect(page.getByText(/authoring and publishing articles/i)).toBeVisible()
           await expect(page.getByRole('button', { name: /Knowledge Consumer/i })).toHaveCount(0)
         })
       })
       ```

    3. **Create `tests-e2e/chat-happy-path.spec.ts`** (SC #2):
       ```ts
       import { test, expect } from '@playwright/test'
       import { mockPrompts, mockChatSuccess } from './fixtures/mockChat'

       test('SC #2 — author chip click → typing dots → streaming answer + controls', async ({ page }) => {
         await mockPrompts(page)
         await page.route('**/api/chat', route =>
           mockChatSuccess(route, { deltaText: 'In the Short description field, enter a concise summary of the issue.' }),
         )
         await page.goto('/')
         await page.getByRole('button', { name: /KB Author/i }).click()
         // Click the first author chip
         const chip = page.getByRole('listitem').first()
         await chip.click()
         // Typing dots may flash or not — assert the assistant body text arrives
         await expect(page.getByText(/Short description field/i)).toBeVisible()
         // Citation pill rendered
         await expect(page.getByText(/KB0022991/)).toBeVisible()
         // 👍 and 👎 buttons present
         await expect(page.getByRole('button', { name: /thumb[s]? up|good/i })).toBeVisible()
         await expect(page.getByRole('button', { name: /thumb[s]? down|bad/i })).toBeVisible()
         // Copy button present
         await expect(page.getByRole('button', { name: /copy/i })).toBeVisible()
         // Chip row hidden after first message
         await expect(page.getByRole('listitem')).toHaveCount(0)
         // Timestamp time element present (CHAT-06 tabIndex=0)
         const timeEl = page.locator('time').first()
         await expect(timeEl).toBeVisible()
         await expect(timeEl).toHaveAttribute('tabindex', '0')
       })
       ```

    4. **Add test:e2e script** in `package.json` — already added in Plan 01; confirm: `"test:e2e": "playwright test"`. If missing, add.

    5. **Commit:** `test(phase-3/plan-06): add mock fixtures + SC#1 role-select + SC#2 chat-happy-path e2e specs`.
  </action>
  <verify>
    - `pnpm test:e2e` runs; all SC#1 and SC#2 specs pass (expect 5 specs: 3 role-select + 1 returning-user + 1 happy path).
    - Playwright webServer successfully boots `pnpm dev` on localhost:3000 (visible in output).
    - Specs complete in under 60s total against a warm dev server.
    - If a spec flakes on typing-dots timing, the fix is a `page.waitFor('...')` on the final body text (which is the deterministic signal) — do NOT add fixed waits.
  </verify>
  <done>
    SC #1 and SC #2 are proven by Playwright. The shared fixture is the seed for all remaining specs.
  </done>
</task>

<task type="auto">
  <name>Task 6.2: SC#3 (stop/new/change) + SC#4 (keyboard/error/retry) + SC#5 (copy/feedback) + Pitfall 13 + Pitfall 17</name>
  <files>tests-e2e/controls-stop-new-change.spec.ts, tests-e2e/keyboard-and-error-retry.spec.ts, tests-e2e/copy-and-feedback.spec.ts, tests-e2e/role-contamination.spec.ts</files>
  <action>
    1. **Create `tests-e2e/controls-stop-new-change.spec.ts`** (SC #3 + Pitfall 13):
       ```ts
       import { test, expect } from '@playwright/test'
       import { mockPrompts, mockChatSuccess, mockChatSlow } from './fixtures/mockChat'

       test.describe('SC #3 — Stop / New conversation / Change role', () => {
         test('Stop cancels mid-stream and preserves accumulated text', async ({ page }) => {
           await mockPrompts(page)
           await page.route('**/api/chat', route => mockChatSlow(route))
           await page.goto('/')
           await page.getByRole('button', { name: /Knowledge Consumer/i }).click()
           await page.getByRole('textbox').fill('How do I flag?')
           await page.getByRole('button', { name: /send message/i }).click()
           // Wait for the first delta to render
           await expect(page.getByText(/Start of a long answer/i)).toBeVisible()
           // Stop button now present
           await page.getByRole('button', { name: /stop response/i }).click()
           // Accumulated text is still visible (Pitfall 5 — stoppedByUser preserves partial text)
           await expect(page.getByText(/Start of a long answer/i)).toBeVisible()
           // Submit button re-enabled (is no longer a Stop — aria-label changes)
           await expect(page.getByRole('button', { name: /send message/i })).toBeVisible()
         })

         test('New conversation clears without changing role', async ({ page }) => {
           await mockPrompts(page)
           await page.route('**/api/chat', route => mockChatSuccess(route))
           await page.goto('/')
           await page.getByRole('button', { name: /Knowledge Consumer/i }).click()
           await page.getByRole('textbox').fill('first question')
           await page.getByRole('button', { name: /send message/i }).click()
           await expect(page.getByText(/flag an article/i)).toBeVisible()
           await page.getByRole('button', { name: /new conversation/i }).click()
           // Greeting returns, chips return, messages gone
           await expect(page.getByText(/flagging articles, leaving feedback/i)).toBeVisible()
           await expect(page.getByRole('listitem').first()).toBeVisible()
           await expect(page.getByText(/flag an article/i)).toHaveCount(0)
           // Role pill still shows Consumer
           await expect(page.getByRole('button', { name: /Knowledge Consumer/i })).toBeVisible()
         })

         test('Change role → confirm → back to RoleSelect + conversation cleared', async ({ page }) => {
           await mockPrompts(page)
           await page.route('**/api/chat', route => mockChatSuccess(route))
           await page.goto('/')
           await page.getByRole('button', { name: /Knowledge Consumer/i }).click()
           await page.getByRole('textbox').fill('q1')
           await page.getByRole('button', { name: /send message/i }).click()
           await expect(page.getByText(/flag an article/i)).toBeVisible()
           // Open role pill popover
           await page.getByRole('button', { name: /Knowledge Consumer/i }).click()
           await page.getByRole('button', { name: /change role/i }).click()
           // Confirm dialog — Cancel is default focused (Pitfall 18)
           await expect(page.getByRole('dialog')).toBeVisible()
           await expect(page.getByRole('button', { name: /^cancel$/i })).toBeFocused()
           // Confirm the change
           await page.getByRole('button', { name: /^change role$/i }).click()
           // Back on RoleSelect
           await expect(page.getByRole('button', { name: /Knowledge Consumer/i })).toBeVisible()
           await expect(page.getByRole('button', { name: /KB Author/i })).toBeVisible()
           // sessionStorage.kbroles.role cleared
           const roleInSS = await page.evaluate(() => sessionStorage.getItem('kbroles.role'))
           expect(roleInSS).toBeNull()
         })
       })
       ```

    2. **Create `tests-e2e/keyboard-and-error-retry.spec.ts`** (SC #4):
       ```ts
       import { test, expect } from '@playwright/test'
       import { mockPrompts, mockChatSuccess, mockChatError } from './fixtures/mockChat'

       test.describe('SC #4 — Keyboard + error + retry', () => {
         test('Enter submits; Shift+Enter inserts newline', async ({ page }) => {
           await mockPrompts(page)
           await page.route('**/api/chat', route => mockChatSuccess(route))
           await page.goto('/')
           await page.getByRole('button', { name: /Knowledge Consumer/i }).click()
           const input = page.getByRole('textbox')
           await input.focus()
           // Shift+Enter: newline, NO submit
           await page.keyboard.down('Shift')
           await page.keyboard.press('Enter')
           await page.keyboard.up('Shift')
           await input.type('second line')
           // Value has a newline before 'second line'
           const val = await input.inputValue()
           expect(val).toContain('\n')
           expect(val).toContain('second line')
           // Enter alone: submits
           await page.keyboard.press('Enter')
           await expect(page.getByText(/flag an article/i)).toBeVisible()
         })

         test('Server 5xx → ErrorCard with Retry → successful retry', async ({ page }) => {
           await mockPrompts(page)
           let hits = 0
           await page.route('**/api/chat', async route => {
             hits += 1
             if (hits === 1) return mockChatError(route)
             return mockChatSuccess(route)
           })
           await page.goto('/')
           await page.getByRole('button', { name: /Knowledge Consumer/i }).click()
           await page.getByRole('textbox').fill('What is happening?')
           await page.getByRole('button', { name: /send message/i }).click()
           // ErrorCard renders with Retry
           await expect(page.getByRole('alert')).toBeVisible()
           const retry = page.getByRole('button', { name: /retry/i })
           await expect(retry).toBeVisible()
           // Expand Details to see request ID (CHAT-07 + bug-report affordance)
           await page.getByRole('button', { name: /^details$/i }).click()
           await expect(page.getByText(/Request ID:/i)).toBeVisible()
           // Click Retry — second mock returns happy path
           await retry.click()
           await expect(page.getByText(/flag an article/i)).toBeVisible()
           // User question appears ONCE (no duplicate on retry)
           await expect(page.getByText('What is happening?')).toHaveCount(1)
         })
       })
       ```

    3. **Create `tests-e2e/copy-and-feedback.spec.ts`** (SC #5):
       ```ts
       import { test, expect } from '@playwright/test'
       import { mockPrompts, mockChatSuccess } from './fixtures/mockChat'

       test.use({
         permissions: ['clipboard-read', 'clipboard-write'],
       })

       test.describe('SC #5 — Copy with citation suffix + 👎 fixed-option radio', () => {
         test('Copy writes exact UTIL-01 format including (Source: KB0022991 · Flagging Articles)', async ({ page }) => {
           await mockPrompts(page)
           await page.route('**/api/chat', route =>
             mockChatSuccess(route, { deltaText: 'Click the flag icon in the article header.' }),
           )
           await page.goto('/')
           await page.getByRole('button', { name: /Knowledge Consumer/i }).click()
           await page.getByRole('textbox').fill('How do I flag?')
           await page.getByRole('button', { name: /send message/i }).click()
           await expect(page.getByText(/Click the flag icon/i)).toBeVisible()

           await page.getByRole('button', { name: /copy/i }).click()

           // Read clipboard
           const clipped = await page.evaluate(() => navigator.clipboard.readText())
           expect(clipped).toBe(
             'Click the flag icon in the article header.\n\n(Source: KB0022991 · Flagging Articles)',
           )
         })

         test('👎 opens panel with 4 radio options, NO free-text input', async ({ page }) => {
           await mockPrompts(page)
           await page.route('**/api/chat', route => mockChatSuccess(route))
           await page.goto('/')
           await page.getByRole('button', { name: /Knowledge Consumer/i }).click()
           await page.getByRole('textbox').fill('question')
           await page.getByRole('button', { name: /send message/i }).click()
           await expect(page.getByText(/flag an article/i)).toBeVisible()

           await page.getByRole('button', { name: /thumb[s]? down|bad/i }).click()

           // Panel appears with 4 radios
           const region = page.getByRole('region', { name: /not helpful/i })
           await expect(region).toBeVisible()
           await expect(region.getByRole('radio')).toHaveCount(4)

           // No textarea or text input anywhere inside the feedback panel (FDBK-02 — no free text)
           await expect(region.locator('textarea')).toHaveCount(0)
           await expect(region.locator('input[type="text"]')).toHaveCount(0)

           // Select "Wrong citation" → panel closes
           await region.getByRole('radio', { name: /wrong citation/i }).click()
           await expect(region).toHaveCount(0)
         })
       })
       ```

    4. **Create `tests-e2e/role-contamination.spec.ts`** (Pitfall 4 + Pitfall 13 + Pitfall 17):
       ```ts
       import { test, expect } from '@playwright/test'
       import { mockPrompts, mockChatSlow, mockChatSuccess } from './fixtures/mockChat'

       test.describe('Pitfall regressions — role contamination + refresh draft-only', () => {
         test('Pitfall 13 — change role MID-STREAM does not leak old-role text into new bubble', async ({ page }) => {
           await mockPrompts(page)
           // First call (consumer): slow stream emits one delta and hangs.
           // Second call (author): happy-path content.
           let callCount = 0
           await page.route('**/api/chat', async route => {
             callCount += 1
             const body = route.request().postDataJSON() as { role: string }
             if (callCount === 1 && body.role === 'consumer') return mockChatSlow(route)
             if (callCount === 2 && body.role === 'author') return mockChatSuccess(route, { deltaText: 'Author-specific answer for publishing.' })
             return route.abort()
           })
           await page.goto('/')
           await page.getByRole('button', { name: /Knowledge Consumer/i }).click()
           await page.getByRole('textbox').fill('long consumer question')
           await page.getByRole('button', { name: /send message/i }).click()
           await expect(page.getByText(/Start of a long answer/i)).toBeVisible()

           // Open role pill → Change role → confirm
           await page.getByRole('button', { name: /Knowledge Consumer/i }).click()
           await page.getByRole('button', { name: /change role/i }).click()
           await page.getByRole('button', { name: /^change role$/i }).click()

           // Back on RoleSelect; pick Author
           await page.getByRole('button', { name: /KB Author/i }).click()

           // Ask an author question
           await page.getByRole('textbox').fill('Author question')
           await page.getByRole('button', { name: /send message/i }).click()

           // New bubble contains ONLY the author answer — zero leakage from the aborted consumer stream
           await expect(page.getByText(/Author-specific answer for publishing/i)).toBeVisible()
           await expect(page.getByText(/Start of a long answer/i)).toHaveCount(0)
           // Only one request went out for 'author'
           expect(callCount).toBe(2)
         })

         test('Pitfall 17 — refresh restores DRAFT but not message history; role persists', async ({ page }) => {
           await mockPrompts(page)
           await page.route('**/api/chat', route => mockChatSuccess(route))
           await page.goto('/')
           await page.getByRole('button', { name: /Knowledge Consumer/i }).click()

           // Type a draft, do NOT send
           await page.getByRole('textbox').fill('draft in progress — do not lose me')
           // Debounce is 250ms — wait a bit past it
           await page.waitForTimeout(400)

           // Refresh
           await page.reload()

           // Role persisted (still on Consumer chat)
           await expect(page.getByText(/flagging articles, leaving feedback/i)).toBeVisible()
           // Draft restored
           await expect(page.getByRole('textbox')).toHaveValue('draft in progress — do not lose me')

           // Send a real message, refresh again
           await page.getByRole('textbox').fill('my question')
           await page.getByRole('button', { name: /send message/i }).click()
           await expect(page.getByText(/flag an article/i)).toBeVisible()

           await page.reload()
           // Messages wiped (AUTH-02 — not persisted)
           await expect(page.getByText(/flag an article/i)).toHaveCount(0)
           await expect(page.getByText(/my question/)).toHaveCount(0)
           // Draft cleared on send, so textbox empty now
           await expect(page.getByRole('textbox')).toHaveValue('')
           // But role still persisted
           await expect(page.getByText(/flagging articles, leaving feedback/i)).toBeVisible()
         })
       })
       ```

    5. **Commit:** `test(phase-3/plan-06): close Phase-3 with SC#3/#4/#5 + Pitfall 13/17 e2e coverage`.
  </action>
  <verify>
    - `pnpm test:e2e` runs the full suite; all 12+ specs across the 6 files pass.
    - Wall-clock under ~3 min against a warm dev server.
    - `cat tests-e2e/role-contamination.spec.ts | grep -E "Pitfall 13|Pitfall 17"` → both markers present.
    - `cat tests-e2e/copy-and-feedback.spec.ts | grep "KB0022991 · Flagging Articles"` → asserts the exact UTIL-01 suffix string.
    - Clipboard permissions: the copy test has `test.use({ permissions: ['clipboard-read', 'clipboard-write'] })` at the file head.
  </verify>
  <done>
    All 5 Phase-3 Success Criteria validated in a real browser. Pitfall 13 (change-role mid-stream) and Pitfall 17 (draft-only on refresh) have dedicated regression specs. Phase 3 is behaviourally closed.
  </done>
</task>

</tasks>

<verification>
  - `pnpm test:e2e` green — all specs pass.
  - `pnpm test` still green — E2E specs live under tests-e2e/ and are NOT picked up by vitest's include glob (src/**/__tests__/...), so unit suite runs unchanged.
  - Every SC from ROADMAP §Phase 3 has a Playwright assertion that verifies the observable behaviour.
  - Pitfall 13 + Pitfall 17 explicit specs green.
  - UTIL-01 exact string `(Source: KB0022991 · Flagging Articles)` asserted by `expect(...).toBe(...)` (not a loose contains).
  - FDBK-02 no-free-text asserted via `textarea` + `input[type="text"]` count assertions inside the feedback panel.
</verification>

<success_criteria>
Phase-3 SC #1 — role-select.spec.ts (3 tests + returning-user test).
Phase-3 SC #2 — chat-happy-path.spec.ts (1 comprehensive test covering typing-dots, streaming, citation, timestamp, thumbs-pair, chip-hide).
Phase-3 SC #3 — controls-stop-new-change.spec.ts (3 tests).
Phase-3 SC #4 — keyboard-and-error-retry.spec.ts (2 tests).
Phase-3 SC #5 — copy-and-feedback.spec.ts (2 tests with clipboard permission).
Pitfall 13 + Pitfall 17 — role-contamination.spec.ts (2 tests).

Total: ≥12 Playwright specs, all SCs + 2 regression flows, fully mocked /api/chat and /api/prompts.
</success_criteria>

<output>
After completion, create `.planning/phases/03-role-experience-and-chat-ui/03-06-SUMMARY.md`. Capture:
- Playwright version in use.
- Total number of E2E specs (≥12) and wall-clock runtime.
- Each SC→spec mapping with test names, so Phase-3 verification can cross-check SC closure.
- Confirm Pitfall 13 and Pitfall 17 regressions both green by test name.
- Flag known tradeoffs:
  - E2E uses chromium only (webkit + firefox are Phase-5 Teams-compatibility concerns, not Phase 3).
  - The mock fixture emits SSE as a single fulfilled body (not truly chunked) — partial-frame buffering is tested at unit level in Plan 03 useChatStream.
  - Real /api/chat integration (no mocks) is manually smoke-verified via `pnpm dev` — future v1.1 could add a Playwright project that targets the real backend behind a feature flag.
- Phase-3 closure checklist: 5 SCs proven by E2E + 2 pitfalls covered + 16 requirements mapped (AUTH-02, ROLE-01..05, CHAT-01..07, FDBK-01, FDBK-02, UTIL-01 — cross-check against REQUIREMENTS.md).
</output>
