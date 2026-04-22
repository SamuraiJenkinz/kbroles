import { z } from 'zod'

const EnvSchema = z.object({
  LLM_AUTH_MODE: z.enum(['bearer', 'api-key']),
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1),
  // Strict-mode capability flag. Default 'true'. Set to 'false' only when
  // Smoke 2 remediation determines the MGTI deployment does NOT honour
  // response_format: { type: 'json_schema', strict: true }. This flag is
  // typed + validated here (not read raw via process.env) so typos like
  // 'flase', 'False', or '0' fail fast at loadEnv() instead of silently
  // leaving the fallback path inactive. See 01-CONTEXT.md §2/§4.
  STRICT_SCHEMA_SUPPORTED: z.enum(['true', 'false']).optional().default('true'),

  // Phase-2 /api/chat route limits (02-CONTEXT.md §3 + §4.1).
  // z.coerce.number() lets process.env string values like "20" parse
  // correctly — without coerce, zod would reject the raw string. All three
  // fields are optional with sensible defaults so local dev + tests work
  // without .env.local extensions; production tunes them per capacity plan.
  //
  //  MAX_INFLIGHT_STREAMS: cap for the AsyncSemaphore (ARCHITECTURE §14
  //    line 707 — 20 is the pilot number).
  //  MAX_MESSAGES: history cap on the /api/chat request body (20 messages
  //    × ~500 chars avg ≈ 10K chars — leaves headroom under the 128K
  //    context window after the system prompt budget).
  //  MAX_MESSAGE_CHARS: per-message length cap — accidental-paste DOS
  //    mitigation + narrows the PITFALLS #7 injection-by-bulk surface.
  MAX_INFLIGHT_STREAMS: z.coerce.number().int().min(1).optional().default(20),
  MAX_MESSAGES:         z.coerce.number().int().min(1).optional().default(20),
  MAX_MESSAGE_CHARS:    z.coerce.number().int().min(1).optional().default(8000),

  // Phase-2 upstream resilience knobs (02-CONTEXT.md §3 + 03-PLAN Task 3.2/3.3).
  // All four fields use z.coerce.number().int() — the same process.env-string-
  // coercion pattern as the MAX_* block above. Defaults are authoritative per
  // CONTEXT §3; test coverage in src/config/__tests__/env.test.ts locks them.
  //
  //  UPSTREAM_TOTAL_TIMEOUT_MS: route-side AbortController fires this long
  //    after request arrival (Plan 04 wires the controller; Plan 03 plumbs
  //    the signal through streamAnswer). 45000ms chosen per CONTEXT §3.
  //  UPSTREAM_RETRY_MAX: maximum RETRIES (default 2 = 3 total attempts).
  //    Capped at 5 to prevent runaway backoff consuming the total-timeout
  //    budget entirely.
  //  UPSTREAM_RETRY_BASE_MS: exponential backoff base (500ms). attempt=0
  //    waits 500ms, attempt=1 waits 1000ms, attempt=2 waits 2000ms.
  //  UPSTREAM_RETRY_JITTER_MS: symmetric jitter range ±250ms added to each
  //    wait so N concurrent retries don't align on the same slot.
  UPSTREAM_TOTAL_TIMEOUT_MS: z.coerce.number().int().min(1000).optional().default(45000),
  UPSTREAM_RETRY_MAX:        z.coerce.number().int().min(0).max(5).optional().default(2),
  UPSTREAM_RETRY_BASE_MS:    z.coerce.number().int().min(100).optional().default(500),
  UPSTREAM_RETRY_JITTER_MS:  z.coerce.number().int().min(0).optional().default(250),
})

export type Env = z.infer<typeof EnvSchema>

let cached: Env | null = null

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error(`Invalid env: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`)
  }
  return parsed.data
}

export function env(): Env {
  if (!cached) cached = loadEnv()
  return cached
}

// Reset for tests that mutate process.env
export function __resetEnvCacheForTests(): void {
  cached = null
}
