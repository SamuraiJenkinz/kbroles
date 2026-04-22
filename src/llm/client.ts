import OpenAI from 'openai'
import { env } from '@/config/env'

/**
 * Single source of auth-mode branching in the codebase.
 *
 * - Dev: `bearer` mode. apiKey goes into the SDK's Authorization: Bearer header.
 *   LLM_BASE_URL points at https://api.openai.com/v1.
 *
 * - Prod: `api-key` mode. apiKey is the MGTI-issued key and is sent as the
 *   `api-key` HTTP header (Azure-compatible). The SDK's apiKey field is set
 *   to a placeholder because the SDK throws on empty/undefined — but the
 *   real auth is the defaultHeaders entry.
 *
 * No NODE_ENV checks in this file or anywhere else. Env contract is the
 * single source of truth; misconfiguration fails fast in loadEnv().
 *
 * See 01-CONTEXT.md §4 (authoritative). GRND-06 invariant. Pitfall #11
 * (ingress auth break) primary mitigation.
 */
export function createLlmClient(): OpenAI {
  const e = env()
  if (e.LLM_AUTH_MODE === 'api-key') {
    return new OpenAI({
      baseURL: e.LLM_BASE_URL,
      apiKey: 'placeholder', // SDK requires non-empty; ignored by MGTI
      defaultHeaders: { 'api-key': e.LLM_API_KEY }, // the real auth header
    })
  }
  // bearer mode — the SDK's default Authorization: Bearer flow.
  return new OpenAI({
    baseURL: e.LLM_BASE_URL,
    apiKey: e.LLM_API_KEY,
  })
}
