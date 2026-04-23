---
phase: 05-sso-and-teams-delivery
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/health/route.ts
  - src/app/api/health/__tests__/route.test.ts
  - src/app/access-denied/page.tsx
  - src/app/access-denied/__tests__/page.test.tsx
  - src/chat-ui/types.ts
  - src/chat-ui/ErrorCard.tsx
  - src/chat-ui/__tests__/ErrorCard.test.tsx
autonomous: true

must_haves:
  truths:
    - "`GET /api/health` returns 200 with `{status:'ok', checks:{env:'ok', mgti:'ok'}}` when env parses cleanly AND the MGTI base URL responds (any status <500) within a 5s AbortController timeout."
    - "`GET /api/health` returns 503 with `{status:'degraded', checks:{env:'...', mgti:'...'}}` when env fails to parse OR MGTI HEAD times out / returns 500+. No auth required (Plan 05 deploy smoke hits this without a token)."
    - "`/access-denied` renders a full-page message for authenticated-but-wrong-tenant users; surfaces the Content Steward email from `/api/config` via `useConfig`; leaks NO JWT claims, tenant IDs, or technical detail (CONTEXT §Blocked-user UX)."
    - "`ErrorCode` wire type includes `'token_expired'` as the 9th code (CONTEXT-accepted extension to the 8 locked in Phase 2). `ErrorCard`'s `TITLE` map has a `token_expired` entry matching voice of existing codes."
    - "`ErrorCard` primary action for `token_expired` is labeled 'Sign back in' (not 'Retry'); its onClick (wired in Plan 04) will trigger MSAL `acquireTokenSilent` → fallback `acquireTokenRedirect`. For Plan 02, the button dispatches an existing `onRetry` prop — Plan 04 swaps the wiring at the call-site in ChatSurface."
  artifacts:
    - path: "src/app/api/health/route.ts"
      provides: "Node runtime GET /api/health returning env + MGTI reachability checks"
      exports: ["GET", "runtime", "dynamic"]
    - path: "src/app/access-denied/page.tsx"
      provides: "Full-page wrong-tenant block with Content Steward mailto"
      exports: ["default"]
    - path: "src/chat-ui/types.ts"
      provides: "ErrorCode union extended with 'token_expired' and SseEvent.error carries it"
      contains: "token_expired"
    - path: "src/chat-ui/ErrorCard.tsx"
      provides: "ErrorCard handles token_expired with Sign back in CTA + adjusted copy"
      contains: "token_expired"
  key_links:
    - from: "src/app/api/health/route.ts"
      to: "src/config/env.ts + LLM_BASE_URL"
      via: "env() parse + fetch(LLM_BASE_URL, {method:'HEAD', signal:AbortSignal.timeout(5000)})"
      pattern: "env\\(\\)|fetch.*HEAD"
    - from: "src/app/access-denied/page.tsx"
      to: "src/chat-ui/useConfig.ts"
      via: "useConfig() → contentStewardEmail for mailto"
      pattern: "useConfig|contentStewardEmail"
    - from: "src/chat-ui/ErrorCard.tsx"
      to: "src/chat-ui/types.ts"
      via: "ErrorCode union includes 'token_expired'"
      pattern: "token_expired"
---

<objective>
Three independent code additions that Phase-5 plans downstream rely on but which touch none of the auth-library code in Plan 01. Running in parallel with Plan 01 keeps Wave 1 fat.

Purpose:
- `/api/health` is the Plan-05 CI/CD canary smoke target — must exist BEFORE the GitHub Actions workflow references it.
- `/access-denied` is the redirect target when Plan-03 middleware rejects a wrong-tenant JWT.
- `token_expired` 9th error code + ErrorCard extension is needed by Plan-03 (chat route emits it) and Plan-04 (ErrorCard's primary CTA is re-wired to trigger MSAL silent-then-redirect).

Phase-2 invariant preserved: `ErrorCode` is the ONLY locked wire contract change. The 9th code is explicitly accepted in CONTEXT §Auth boundary. `/api/chat`'s single-log-per-request finally block is not touched here — Plan 03 extends it.

Output:
- `src/app/api/health/route.ts` + tests — Node runtime, 5s MGTI HEAD with AbortController, returns 200/503 per RESEARCH §Pattern 9.
- `src/app/access-denied/page.tsx` + tests — full-page minimal layout reusing Phase-4 typography; mailto uses `contentStewardEmail` from `/api/config`.
- `src/chat-ui/types.ts` — `ErrorCode` includes `'token_expired'`.
- `src/chat-ui/ErrorCard.tsx` — TITLE map extended; primary button copy branched; tests cover token_expired rendering.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05-sso-and-teams-delivery/05-CONTEXT.md
@.planning/phases/05-sso-and-teams-delivery/05-RESEARCH.md

# Integration points
@src/config/env.ts
@src/chat-ui/types.ts
@src/chat-ui/ErrorCard.tsx
@src/chat-ui/useConfig.ts
@src/chat-ui/__tests__/ErrorCard.test.tsx
@src/app/api/config/route.ts
@src/app/api/prompts/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: /api/health + /access-denied page</name>
  <files>
    src/app/api/health/route.ts,
    src/app/api/health/__tests__/route.test.ts,
    src/app/access-denied/page.tsx,
    src/app/access-denied/__tests__/page.test.tsx
  </files>
  <action>
Two unrelated-but-similarly-sized surfaces. Pair them to keep the plan honest at 2 tasks.

**1. `src/app/api/health/route.ts`** — match RESEARCH §Pattern 9 exactly. NO auth. Used by Plan-05 CI/CD smoke.

```typescript
/**
 * GET /api/health — Phase-5 CI/CD canary smoke target (DELV-04).
 *
 * Returns 200 when env parses AND the MGTI base URL responds at all
 * (any status <500); 503 when either check fails.
 *
 * Deliberately does NOT authenticate — the GitHub Actions workflow
 * (Plan 05-05) hits this without an Entra token. It also does NOT hit
 * /api/chat because that would burn an MGTI token on every push to main
 * (CONTEXT §CI/CD pipeline — full /api/chat canary is Phase-6 nightly).
 *
 * MGTI HEAD check uses 5s AbortController timeout. 401 is expected when
 * hitting LLM_BASE_URL without a token — it counts as reachable (status <500).
 *
 * Phase 5 — Plan 05-02 Task 1.
 */
import { env } from '@/config/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Check = 'ok' | 'fail'

export async function GET(): Promise<Response> {
  let envCheck: Check = 'fail'
  let mgtiCheck: Check = 'fail'
  let llmBaseUrl: string | null = null

  try {
    const parsed = env()
    envCheck = 'ok'
    llmBaseUrl = parsed.LLM_BASE_URL
  } catch {
    envCheck = 'fail'
  }

  if (llmBaseUrl) {
    try {
      const resp = await fetch(llmBaseUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5_000),
      })
      mgtiCheck = resp.status < 500 ? 'ok' : 'fail'
    } catch {
      mgtiCheck = 'fail'
    }
  }

  const allOk = envCheck === 'ok' && mgtiCheck === 'ok'
  return Response.json(
    {
      status: allOk ? 'ok' : 'degraded',
      checks: { env: envCheck, mgti: mgtiCheck },
    },
    {
      status: allOk ? 200 : 503,
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    },
  )
}
```

**2. `src/app/api/health/__tests__/route.test.ts`** — cover all four permutations of env×mgti × status code. Follow the `/api/prompts/__tests__/route.test.ts` direct-invocation pattern.

Test cases:
- env ok + mgti HEAD returns 401 → 200 `{status:'ok'}` (401 is `<500` = reachable).
- env ok + mgti HEAD throws (network error) → 503 `{status:'degraded', checks:{mgti:'fail'}}`.
- env ok + mgti HEAD returns 502 → 503.
- env fails (set `process.env.LLM_BASE_URL = ''` + reset env cache) → 503 with `checks.env:'fail'`.

Mock `fetch` via `global.fetch = vi.fn().mockImplementation(...)`. Use `__resetEnvCacheForTests()` between tests.

**3. `src/app/access-denied/page.tsx`** — client component; minimal full-page layout reusing Phase-4 typography tokens (Tailwind neutral-*, red-600 accent for the warning heading).

```tsx
'use client'
import { ShieldOff } from 'lucide-react'
import { useConfig } from '@/chat-ui/useConfig'

/**
 * Wrong-tenant full-page block. Phase-5 auth middleware (Plan 03) + Phase-5
 * AuthProvider (Plan 04) both redirect users here when a JWT's `tid` is
 * valid-but-not-MMC or when an NAA sign-in surfaces a non-allowlisted tenant.
 *
 * CONTEXT §Blocked-user UX invariant: leak NO JWT claims, tenant IDs, or
 * technical detail. Mailto uses contentStewardEmail from /api/config (same
 * source as the Phase-4 FallbackCard's flag-a-gap button).
 */
export default function AccessDeniedPage() {
  const { config } = useConfig()
  const email = config?.contentStewardEmail ?? 'kb-knowledge-team@mmc.com'
  const subject = encodeURIComponent('KB Assistant — access request')
  const body = encodeURIComponent(
    "Hi CTSS Knowledge team,\n\nI'm trying to access the KB Assistant but was blocked. Please let me know if there's a way for me to use it.\n\nThanks.",
  )
  const mailto = `mailto:${email}?subject=${subject}&body=${body}`

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
      <ShieldOff size={48} className="text-red-600" aria-hidden />
      <h1 className="text-2xl font-semibold text-neutral-900">Access restricted</h1>
      <p className="text-sm text-neutral-600">
        This assistant is available only to MMC colleagues. If you believe this is an error, contact the CTSS Knowledge team.
      </p>
      <a
        href={mailto}
        className="mt-2 rounded-md border border-neutral-border px-4 py-2 text-sm hover:bg-neutral-50"
      >
        Contact CTSS Knowledge team
      </a>
    </main>
  )
}
```

**4. `src/app/access-denied/__tests__/page.test.tsx`** — RTL render; assert heading text, ShieldOff icon, mailto href begins with `mailto:`, copy does NOT contain "tenant", "JWT", "token", or any GUID-shaped string (invariant check: `expect(container.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)`).

Mock `useConfig` to return `{config: {contentStewardEmail: 'steward@mmc.com', versions: {KB0022991:'x',KB0020882:'y',SNOW_FORM:'z'}}}`.
  </action>
  <verify>
`pnpm typecheck` clean. `pnpm test src/app/api/health src/app/access-denied` (all new tests green). `curl http://localhost:3000/api/health` (when MGTI reachable) returns 200 with `{status:'ok'}`.
  </verify>
  <done>
`/api/health` exists, 200/503 behaviour correct, no auth required. `/access-denied` renders full-page with mailto; leaks no technical details; invariant test proves.
  </done>
</task>

<task type="auto">
  <name>Task 2: token_expired 9th error code + ErrorCard Sign back in CTA</name>
  <files>
    src/chat-ui/types.ts,
    src/chat-ui/ErrorCard.tsx,
    src/chat-ui/__tests__/ErrorCard.test.tsx
  </files>
  <action>
Phase-2 originally locked 8 error codes. CONTEXT §Auth boundary explicitly accepts `token_expired` as a permitted 9th code for Phase 5. This task adds it to the wire contract and renders it correctly in `ErrorCard`. Plan-03 emits the SSE frame from `/api/chat`; Plan-04 wires the CTA to MSAL silent-then-redirect.

**1. `src/chat-ui/types.ts`** — extend `ErrorCode`:

```typescript
// ─── ErrorCode  (contract §6) ────────────────────────────────────────────────

export type ErrorCode =
  | 'upstream_timeout'
  | 'upstream_5xx'
  | 'schema_reject_after_retry'
  | 'internal'
  | 'token_expired'  // Phase-5 9th code. Emitted when the Entra JWT attached
                     //   to an in-flight /api/chat request has expired mid-stream.
                     //   Frontend maps this to a "Sign back in" CTA that
                     //   triggers acquireTokenSilent → acquireTokenRedirect
                     //   (wired in Plan 05-04 ChatSurface call-site).
```

IMPORTANT: Do NOT broaden `SseEvent` discriminant union shape — it already carries `{type:'error', code:ErrorCode, message:string}`. The existing union accepts the new code automatically via `ErrorCode` widening. Verify with `pnpm typecheck`.

**2. `src/chat-ui/ErrorCard.tsx`** — add TITLE entry + branch CTA copy.

```typescript
const TITLE: Record<ErrorCode, string> = {
  upstream_timeout: 'The knowledge service took too long.',
  upstream_5xx: 'The knowledge service is temporarily unavailable.',
  schema_reject_after_retry: 'We could not format the answer.',
  internal: 'Something went wrong.',
  token_expired: 'Your session expired.',  // Phase-5 9th code.
}
```

Adjust the primary CTA label + sub-copy based on `errorCode === 'token_expired'`:

```tsx
// Replace the existing <button>Retry</button> block with a branched version:
const primaryLabel = errorCode === 'token_expired' ? 'Sign back in' : 'Retry'
const subCopy = errorCode === 'token_expired'
  ? 'Sign back in to continue — your question was not answered.'
  : 'Your question wasn\'t answered.'
```

Wire the two strings into the existing JSX (replace the hard-coded "Your question wasn't answered." and the "Retry" button label). `onRetry` prop binding stays identical — Plan 04 re-wires the call-site at ChatSurface to invoke MSAL silent-then-redirect instead of retry-the-send. From ErrorCard's perspective this is just a copy change.

**3. `src/chat-ui/__tests__/ErrorCard.test.tsx`** — extend existing test file (do NOT rewrite). Add cases:
- `errorCode='token_expired'` renders title `'Your session expired.'`.
- Primary button label reads `'Sign back in'`.
- Sub-copy reads `'Sign back in to continue — your question was not answered.'`.
- Clicking the button fires `onRetry` (behaviour unchanged — Plan 04 re-wires call-site).
- Existing test cases for the 4 original codes still pass (rendering unchanged).
  </action>
  <verify>
`pnpm typecheck` clean. `pnpm test src/chat-ui/__tests__/ErrorCard.test.tsx` green. Grep `'token_expired'` in src/chat-ui/types.ts returns exactly one match; in ErrorCard.tsx returns two (TITLE entry + branch condition).
  </verify>
  <done>
`ErrorCode` union has 9 members. ErrorCard renders correctly for all of them. Phase-2 contract change documented in comment; no SseEvent shape change.
  </done>
</task>

</tasks>

<verification>
- `pnpm typecheck` clean (broadened ErrorCode propagates through chatReducer, useChatStream, types.ts without additional edits because all three treat ErrorCode as a discriminated union — verify no match-exhaustive switch broke; if any does, add a `token_expired` arm that mirrors `'internal'` behaviour).
- `pnpm test` green (all existing tests + new tests in src/app/api/health, src/app/access-denied, src/chat-ui/__tests__/ErrorCard.test.tsx).
- `curl -I http://localhost:3000/api/health` returns a status (200 or 503) depending on MGTI reachability from the dev machine.
- `curl http://localhost:3000/access-denied` returns HTML (access-denied page is public — no auth for this route, since user must be able to see it even without a valid token).
- Grep `ErrorCode` across repo: every `switch (errorCode)` or `Record<ErrorCode, ...>` compiles cleanly with the new 9-member union.
</verification>

<success_criteria>
- `/api/health` exists, 200/503 behaviour per RESEARCH Pattern 9; GitHub Actions workflow in Plan 05-05 can curl it.
- `/access-denied` renders; Content Steward mailto works; leaks no claims (invariant test enforced).
- `ErrorCode` wire type has 9 members including `'token_expired'`; `ErrorCard` handles it with correct copy.
- Zero breakage of Phase 2/3/4 tests.
</success_criteria>

<output>
After completion, create `.planning/phases/05-sso-and-teams-delivery/05-02-SUMMARY.md` noting:
- `/api/health` response shape + any deviation from RESEARCH Pattern 9.
- Any exhaustiveness-switch sites that needed a `token_expired` arm (chatReducer, useChatStream) + how they were handled (likely "mirror `'internal'`").
- Test-delta count.
</output>
