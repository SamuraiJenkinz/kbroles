import { z } from 'zod'

const EnvSchema = z.object({
  // Provider switch (Quick 008). Default 'openai' for backward compatibility —
  // every existing prod + test env predates this field. Set to 'anthropic' to
  // route the LLM call through the MGTI /coreapi/llm/anthropic/v1 proxy
  // (Claude 4.5+ via AWS Bedrock). Each provider has its own required-field
  // set enforced by the superRefine block at the bottom of this schema.
  LLM_PROVIDER: z.enum(['openai', 'anthropic']).optional().default('openai'),

  // === OpenAI / Azure-OpenAI fields — required when LLM_PROVIDER=openai ===
  //
  // Optional at the schema level so that LLM_PROVIDER=anthropic can omit them
  // cleanly; the superRefine block below promotes them to required when the
  // provider is openai (default). Existing tests pass all four fields, so the
  // observable behaviour for the OpenAI path is unchanged.
  LLM_AUTH_MODE: z.enum(['bearer', 'api-key']).optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().min(1).optional(),
  // Strict-mode capability flag. Default 'true'. Set to 'false' only when
  // Smoke 2 remediation determines the MGTI deployment does NOT honour
  // response_format: { type: 'json_schema', strict: true }. This flag is
  // typed + validated here (not read raw via process.env) so typos like
  // 'flase', 'False', or '0' fail fast at loadEnv() instead of silently
  // leaving the fallback path inactive. See 01-CONTEXT.md §2/§4.
  STRICT_SCHEMA_SUPPORTED: z.enum(['true', 'false']).optional().default('true'),

  // === Anthropic (MGTI proxy) fields — required when LLM_PROVIDER=anthropic ===
  //
  // The MGTI Anthropic proxy is a native Anthropic Messages API surface (NOT
  // OpenAI-compatible) served at /coreapi/llm/anthropic/v1/model/{modelName}.
  // Auth is the x-api-key header (third mode — distinct from `bearer` and the
  // Azure-OpenAI `api-key` mode). See `info/model-recommendation-gpt4o-vs-mini.html`
  // for the product rationale and the MGTI llm-anthropic spec PDF for the
  // proxy contract.
  //
  // ANTHROPIC_BASE_URL: full proxy URL up to and including `/v1`, e.g.
  //   https://int.nasa.apis.mmc.com/coreapi/llm/anthropic/v1
  // ANTHROPIC_API_KEY: x-api-key value issued via Hubble (https://hubble.mmc.com/apps).
  // ANTHROPIC_MODEL:   model name passed in the URL path. Must be Claude 4.5+,
  //   currently EU-region-prefixed (e.g. eu.anthropic.claude-sonnet-4-5-20250929-v1:0).
  // ANTHROPIC_VERSION: anthropic_version body field. Defaults to bedrock-2023-05-31
  //   per the MGTI spec; rarely needs override.
  // ANTHROPIC_MAX_TOKENS: required by the API. 1024 covers kbroles answers (~150
  //   completion tokens observed) with headroom.
  // ANTHROPIC_TEMPERATURE: 0 by default for citation discipline (mirrors the
  //   local-dev gpt-4o benchmark where temperature was unset/default — Anthropic
  //   defaults are different so we pin it explicitly).
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).optional(),
  ANTHROPIC_VERSION: z.string().min(1).optional().default('bedrock-2023-05-31'),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().int().min(1).optional().default(1024),
  ANTHROPIC_TEMPERATURE: z.coerce.number().min(0).max(1).optional().default(0),
  // Quick 009 — Anthropic tool-use mode. Defaults to 'true' because MGTI's
  // /coreapi/llm/anthropic/v1 proxy passes through `tools` + `tool_choice` to
  // AWS Bedrock, which then enforces the kbroles CITATION_SCHEMA at the API
  // level (analogous to OpenAI's response_format: { type: 'json_schema',
  // strict: true } on the primary path). This restores the defense-in-depth
  // backstop that was missing in Quick 008.
  //
  // Set to 'false' as a proxy-regression escape hatch: if MGTI ever stops
  // honouring `tools` pass-through, flipping this flag falls back to the
  // prompt-only JSON discipline path (text content block + JSON.parse +
  // Ajv with one retry — the same path as quick-008 shipped originally).
  // Same Zod-validated 'true'/'false' string contract as STRICT_SCHEMA_SUPPORTED
  // — catches typos like 'flase' or 'False' at loadEnv() rather than at
  // first request time.
  ANTHROPIC_TOOLS_SUPPORTED: z.enum(['true', 'false']).optional().default('true'),

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

  // Phase-4 Content Steward mailbox (FBK-04).
  // Placeholder today — Phase 6 pilot prep names the real named mailbox.
  // z.string().email() is too strict (accepts Exchange distribution list DNs
  // only when formatted as user@domain.tld). Use z.string().min(1) with a
  // runtime regex check that at least an @ appears.
  CONTENT_STEWARD_EMAIL: z.string().min(1).regex(/@/).optional().default('kb-knowledge-team@mmc.com'),

  // Phase 5.1 — SERVER-ONLY Entra confidential-client auth. Used by
  // @/auth/msalClient.ts (ConfidentialClientApplication constructor). No
  // NEXT_PUBLIC_ prefix — these values never reach the browser bundle.
  //
  // Dev defaults 'dev-only-do-not-use-in-prod' so local pnpm dev + test
  // suites work without Entra; production operators set real GUIDs via
  // AWS Secrets Manager → loadSecrets() → process.env.
  ENTRA_CLIENT_ID: z
    .string()
    .min(1)
    .optional()
    .default('dev-only-do-not-use-in-prod'),
  ENTRA_TENANT_ID: z
    .string()
    .min(1)
    .optional()
    .default('dev-only-do-not-use-in-prod'),

  // Phase-5.1 BFF pivot — SERVER-ONLY auth + deploy config.
  //
  // These five fields are populated EITHER by AWS Secrets Manager via
  // loadSecrets() (production path) OR by process.env / .env.local (dev path).
  // loadSecrets() writes resolved values back onto process.env BEFORE env()
  // reparses, so the zod validation here runs once on the final set.
  //
  // SESSION_SECRET must be >=32 chars (iron-session AES-256-GCM key derivation
  // requirement — iron-session throws at getIronSession() call time otherwise).
  // A development default is provided so Phase 2/3/4 test suites don't need
  // to stub it, but the production-grade path is enforced at runtime by
  // iron-session itself (not duplicated here).
  //
  // ENTRA_CLIENT_SECRET is the confidential-client secret from the Entra App
  // Registration. Unlike the Phase-5 SPA (which has no client secret), the
  // BFF confidential-client flow REQUIRES one. Dev default mirrors the
  // Phase-5 pattern: a non-secret placeholder string that fails obviously in
  // production logs but does not crash tests.
  //
  // APP_BASE_URL is the canonical origin used in BOTH (a) the Entra redirect
  // URI construction (Pitfall 4) and (b) the Set-Cookie Domain scoping. MUST
  // match the Entra App Registration redirect URI exactly — even a trailing
  // slash difference causes AADSTS50011.
  //
  // AWS_SECRET_NAME + AWS_REGION — inputs to loadSecrets(). Defaults match
  // xmcp's convention (/mmc/cts/<app> in us-east-1).
  SESSION_SECRET: z
    .string()
    .min(1)
    .optional()
    .default('dev-only-session-secret-32-chars-min-padding-xxxxxxx'),
  ENTRA_CLIENT_SECRET: z
    .string()
    .min(1)
    .optional()
    .default('dev-only-do-not-use-in-prod'),
  APP_BASE_URL: z
    .string()
    .url()
    .optional()
    .default('http://localhost:3000'),
  AWS_SECRET_NAME: z
    .string()
    .min(1)
    .optional()
    .default('/mmc/cts/kb-assistant'),
  AWS_REGION: z
    .string()
    .min(1)
    .optional()
    .default('us-east-1'),

  // Phase-6 telemetry — Azure Monitor Application Insights OTel distro.
  // Connection string is OPTIONAL — when absent (local dev, CI without the
  // secret), the OTel bootstrap falls back gracefully with a console.info log
  // and does NOT throw. Production operators set this via AWS Secrets Manager
  // → loadSecrets() → process.env. The value is the full InstrumentationKey=…
  // string from the App Insights resource overview blade (not the ikey alone).
  APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().min(1).optional(),
})

// Conditional cross-field validation: the schema-level `optional()` on
// OpenAI and Anthropic field sets lets either side coexist with the other,
// but exactly one set must be fully populated depending on LLM_PROVIDER.
// superRefine runs AFTER defaults, so LLM_PROVIDER is always resolved to
// 'openai' or 'anthropic' (never undefined) by the time this block runs.
const EnvSchemaWithRefine = EnvSchema.superRefine((data, ctx) => {
  if (data.LLM_PROVIDER === 'openai') {
    const required = ['LLM_AUTH_MODE', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'] as const
    for (const field of required) {
      if (!data[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when LLM_PROVIDER=openai`,
        })
      }
    }
  } else if (data.LLM_PROVIDER === 'anthropic') {
    const required = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'] as const
    for (const field of required) {
      if (!data[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when LLM_PROVIDER=anthropic`,
        })
      }
    }
  }
})

export type Env = z.infer<typeof EnvSchemaWithRefine>

let cached: Env | null = null

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchemaWithRefine.safeParse(source)
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
