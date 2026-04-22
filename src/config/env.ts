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
