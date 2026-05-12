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

  // Quick 008 — Anthropic provider path. The MGTI Anthropic proxy is a native
  // Anthropic Messages API surface, not OpenAI-compatible, so the OpenAI SDK
  // is not used to talk to it. streamAnswer's dispatcher routes to the
  // Anthropic adapter (src/llm/anthropicAdapter.ts) when LLM_PROVIDER=anthropic
  // and the returned client below is never called. We still return a valid
  // OpenAI instance (with a placeholder apiKey the SDK accepts) so that
  // call-sites which destructure or pass the client around don't need to
  // change. See .planning/quick/008-anthropic-provider-integration/.
  if (e.LLM_PROVIDER === 'anthropic') {
    return new OpenAI({ apiKey: 'placeholder-not-used-in-anthropic-mode' })
  }

  // OpenAI / Azure-OpenAI path. env.ts superRefine guarantees the OpenAI
  // fields are populated when LLM_PROVIDER=openai (the default), so the
  // non-null assertions below are safe at runtime.
  if (e.LLM_AUTH_MODE === 'api-key') {
    return new OpenAI({
      baseURL: e.LLM_BASE_URL!,
      apiKey: 'placeholder', // SDK requires non-empty; ignored by MGTI
      defaultHeaders: { 'api-key': e.LLM_API_KEY! }, // the real auth header
    })
  }
  // bearer mode — the SDK's default Authorization: Bearer flow.
  return new OpenAI({
    baseURL: e.LLM_BASE_URL!,
    apiKey: e.LLM_API_KEY!,
  })
}
