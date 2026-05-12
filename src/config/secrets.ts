/**
 * Phase 5.1 — AWS Secrets Manager loader with env fallback.
 *
 * Translates xmcp chat_app/secrets.py load_secrets() to Node.js. On the
 * on-prem Windows box the AWS SDK v3 credential chain discovers credentials
 * from (in order): AWS_ACCESS_KEY_ID env vars → %USERPROFILE%\.aws\credentials
 * → process credential provider. No EC2 metadata endpoint lookup will succeed
 * on the Windows box; the chain silently moves past it.
 *
 * The function is module-scoped cache-only: the FIRST successful call loads
 * the secret blob (a JSON object at /mmc/cts/kb-assistant) and writes each
 * key into process.env IF not already set, so subsequent env() calls see
 * the merged view. Dev/.env.local values win over AWS (by already being on
 * process.env at process start) — this matches xmcp's behaviour and lets
 * developers override individual fields locally without touching AWS.
 *
 * On any failure (no credentials, secret not found, JSON parse error) the
 * function returns {} and leaves process.env untouched. The caller is
 * responsible for ensuring dev fallback values exist in .env.local.
 *
 * Pitfall 12 — this function is lazy: production route handlers should
 * call `await loadSecrets()` at the top of their handler (or once at app
 * start via instrumentation.ts — see Plan 03 optional task) so the cold-
 * start ~200-500ms cost is paid once, not per request.
 */

const SECRET_KEYS = [
  'SESSION_SECRET',
  'ENTRA_CLIENT_ID',
  'ENTRA_CLIENT_SECRET',
  'ENTRA_TENANT_ID',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  // Quick 008 — Anthropic (MGTI proxy) x-api-key. Stored alongside LLM_API_KEY
  // so operators can switch providers via LLM_PROVIDER without re-provisioning
  // their AWS Secrets Manager blob. Only consumed when LLM_PROVIDER=anthropic.
  'ANTHROPIC_API_KEY',
  'APPLICATIONINSIGHTS_CONNECTION_STRING',
  'QUESTION_HASH_SALT',
  'SERVICENOW_SERVICE_ACCOUNT',
  'SN_INSTANCE',
  'TEAMS_WEBHOOK_URL',
] as const

let _cache: Record<string, string> | null = null

export async function loadSecrets(): Promise<Record<string, string>> {
  if (_cache) return _cache

  // No-AWS deploy path: when AWS_SECRET_NAME is unset, callers rely on
  // process.env populated by scripts/start.ps1 reading D:\kbroles\.env.production.
  // Short-circuit BEFORE the dynamic AWS SDK import + the catch-and-log path
  // to avoid a noisy info log on every cold start.
  // See: docs/deploy-windows.md Step 4.2 (alternative).
  if (!process.env.AWS_SECRET_NAME) {
    _cache = {}
    return _cache
  }

  const secretName = process.env.AWS_SECRET_NAME! // guarded above
  const region = process.env.AWS_REGION ?? 'us-east-1'

  try {
    // Dynamic import so Vitest in Node without AWS creds doesn't pay the
    // SDK cold-start cost and doesn't fail if the package is absent at
    // runtime (e.g. a developer who skipped `pnpm install` after Plan 01).
    const { SecretsManagerClient, GetSecretValueCommand } = await import(
      '@aws-sdk/client-secrets-manager'
    )
    const client = new SecretsManagerClient({ region })
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretName }),
    )
    const raw = response.SecretString
    if (!raw) {
      _cache = {}
      return _cache
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const merged: Record<string, string> = {}
    for (const key of SECRET_KEYS) {
      const value = parsed[key]
      if (typeof value === 'string' && value.length > 0) {
        merged[key] = value
        // Only write into process.env if the key is not already set by
        // .env.local / explicit env — dev wins over AWS.
        if (process.env[key] === undefined) {
          process.env[key] = value
        }
      }
    }
    _cache = merged
    return merged
  } catch (err) {
    // AWS unreachable, credentials missing, SDK not installed, or JSON
    // parse error. Log at info — this is EXPECTED on local dev.
    // eslint-disable-next-line no-console
    console.info(
      '[secrets] AWS Secrets Manager unavailable — falling back to process.env:',
      err instanceof Error ? err.message : String(err),
    )
    _cache = {}
    return _cache
  }
}

/** Test-only. Forces a re-fetch on next call. */
export function __resetSecretsCacheForTests(): void {
  _cache = null
}
