/**
 * Playwright route-mock helpers for /api/chat and /api/prompts.
 *
 * All SSE frame shapes mirror docs/api-chat-contract.md §3 exactly.
 * Each helper is designed to be passed directly to `page.route(...)`.
 *
 * Usage:
 *   await page.route('**\/api/chat', route => mockChatSuccess(route))
 *   await mockPrompts(page)
 */

import type { Page, Route } from '@playwright/test'

// ─── SSE frame helpers ────────────────────────────────────────────────────────

function frame(obj: Record<string, unknown>): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

// ─── /api/chat mock variants ──────────────────────────────────────────────────

/**
 * Happy-path response: answer_delta → citations → done.
 * Mirrors docs/api-chat-contract.md §3 happy path ordering.
 */
export async function mockChatSuccess(
  route: Route,
  opts?: { deltaText?: string },
): Promise<void> {
  const text =
    opts?.deltaText ??
    'You can flag an article by clicking the flag icon in the article header.'
  const body = [
    frame({ type: 'answer_delta', text }),
    frame({
      type: 'citations',
      citations: [
        {
          source_id: 'KB0022991',
          section_id: 'flagging-articles',
          quote: 'Click the flag icon',
        },
      ],
    }),
    frame({ type: 'done', can_answer: true, validator_flips: 0 }),
  ].join('')

  await route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Request-Id': 'e2e-req-' + Math.random().toString(36).slice(2, 10),
    },
    body,
  })
}

/**
 * Fallback response: single fallback frame (can_answer=false path).
 * Mirrors docs/api-chat-contract.md §3 fallback event.
 */
export async function mockChatFallback(
  route: Route,
  opts?: { reason?: string; text?: string },
): Promise<void> {
  const body = frame({
    type: 'fallback',
    reason: opts?.reason ?? 'can_answer_false',
    text:
      opts?.text ??
      "I'm not able to answer that from the KB knowledge base. Please contact the KB team directly.",
  })

  await route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Request-Id': 'e2e-fb-' + Math.random().toString(36).slice(2, 10),
    },
    body,
  })
}

/**
 * Error response: single error frame (infrastructure failure path).
 * Mirrors docs/api-chat-contract.md §3 error event / §6 ErrorCode.
 */
export async function mockChatError(
  route: Route,
  opts?: { code?: string; message?: string },
): Promise<void> {
  const body = frame({
    type: 'error',
    code: opts?.code ?? 'upstream_5xx',
    message: opts?.message ?? 'upstream 503',
  })

  await route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Request-Id': 'e2e-err-' + Math.random().toString(36).slice(2, 10),
    },
    body,
  })
}

/**
 * Slow/hanging response: delays for a long time before responding.
 * Used for Stop-button and mid-stream Change-role (Pitfall 13) tests.
 *
 * Implementation strategy (Playwright v1.59.1):
 * `route.fulfill` accepts only `string | Buffer` bodies — ReadableStream is not
 * supported. Instead, we delay the entire response fulfillment by 30 seconds,
 * which is longer than the test timeout. During this delay, `useChatStream`
 * is in `setIsStreaming(true)` state (set BEFORE the fetch call completes),
 * so the Stop button is visible and can be clicked.
 *
 * When the test clicks Stop, `abortController.abort()` fires an AbortError on
 * the fetch, and the route.fulfill promise is never awaited to completion by
 * the browser — Playwright automatically aborts the pending route on page
 * close/navigation.
 *
 * The "Start of a long answer… " text is NOT in the response body here (it
 * is never sent because we delay). The Stop-button tests assert:
 *   1. Stop button is visible (isStreaming=true while awaiting response)
 *   2. After clicking Stop, Send button returns (isStreaming=false)
 * They do NOT assert partial delta text (since no delta arrives before Stop).
 *
 * For Pitfall-13 (mid-stream change role), the important assertion is that
 * the OLD role's stream does NOT appear in the NEW role's bubble — also
 * satisfied without a delta being delivered.
 *
 * See docs/api-chat-contract.md §3 answer_delta shape.
 */
export async function mockChatSlow(route: Route): Promise<void> {
  // Delay 30 seconds — effectively "never responds" for E2E test purposes.
  // The AbortController in useChatStream fires before this resolves.
  await new Promise<void>((resolve) => setTimeout(resolve, 30_000))
  // If somehow reached (shouldn't be in normal tests), return a valid delta.
  await route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Request-Id': 'e2e-slow-' + Date.now(),
    },
    body: frame({ type: 'answer_delta', text: 'Start of a long answer… ' }),
  })
}

// ─── /api/prompts mock ────────────────────────────────────────────────────────

// ─── Phase 4 additions — fixtures for mockConfig, mockSources, mockChatWithCitations, mockChatFallback (page-level) ────

/**
 * Intercept GET /api/config → return fixed versions + stub email.
 */
export async function mockConfig(page: Page): Promise<void> {
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
export async function mockSources(page: Page): Promise<void> {
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
 * Page-level variant (installs the route on the page rather than a Route object).
 * The citations arg lets each spec pick which source to cite.
 */
export async function mockChatWithCitations(
  page: Page,
  opts: { deltaText: string; citations: Array<{ source_id: string; section_id: string; quote: string }>; requestId?: string },
): Promise<void> {
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
 * Page-level variant (installs the route on the page rather than a Route object).
 */
export async function mockChatFallbackPage(
  page: Page,
  opts: { text: string; requestId?: string },
): Promise<void> {
  await page.route('**/api/chat', async (route) => {
    const requestId = opts.requestId ?? 'req-e2e-fallback'
    const fallbackFrame = `data: ${JSON.stringify({ type: 'fallback', reason: 'can_answer_false', text: opts.text })}\n\n`
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Request-Id': requestId,
        'Cache-Control': 'no-store',
      },
      body: fallbackFrame,
    })
  })
}

// ─── /api/prompts mock ────────────────────────────────────────────────────────

/**
 * Registers route mocks for GET /api/prompts?role=consumer and ?role=author.
 * Returns 5 consumer chips and 8 author chips matching the Plan 02 fixtures.
 * Mirrors docs/api-chat-contract.md §11 GET /api/prompts response shape.
 */
export async function mockPrompts(page: Page): Promise<void> {
  await page.route('**/api/prompts?role=consumer', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
      body: JSON.stringify({
        role: 'consumer',
        prompts: [
          {
            id: 'cns-01',
            label: 'How do I flag an article?',
            text: 'How do I flag an article in the KB?',
          },
          {
            id: 'cns-02',
            label: 'How do I leave feedback?',
            text: 'How do I leave feedback on a KB article?',
          },
          {
            id: 'cns-03',
            label: 'Where do I find article X?',
            text: 'How do I find a specific KB article?',
          },
          {
            id: 'cns-04',
            label: 'How do I navigate the KB?',
            text: 'What are the main sections of the KB?',
          },
          {
            id: 'cns-05',
            label: 'What do I do if info is wrong?',
            text: 'What should I do if an article has incorrect info?',
          },
        ],
      }),
    }),
  )

  await page.route('**/api/prompts?role=author', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
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
