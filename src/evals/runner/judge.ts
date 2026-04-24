import OpenAI from 'openai'

/**
 * Isolated LLM judge for eval suites.
 *
 * Uses LLM_JUDGE_API_KEY / LLM_JUDGE_BASE_URL so eval cost does NOT tap the
 * production MGTI quota (LLM_API_KEY). createJudgeClient() throws immediately
 * if the env var is absent — CI fails fast rather than silently skipping.
 *
 * Default model: gpt-4o-mini. Override via LLM_JUDGE_MODEL env var.
 * Rationale: gpt-4o-mini is sufficient for binary yes/no entailment + refusal
 * judgments and is ~100× cheaper than gpt-4o. Override to gpt-4o via
 * LLM_JUDGE_MODEL=gpt-4o if pilot data shows judge disagreement above the
 * flake threshold. See CONTEXT.md §Cost budget — this brings nightly cost
 * from ~$180 to ~$0.36/mo. (Authorized deviation from CONTEXT.md gpt-4o
 * assumption; documented in 06-05-SUMMARY.md.)
 */
export interface JudgeClient {
  judge(prompt: string): Promise<0 | 1>
}

/**
 * Create an LLM judge client. Throws if LLM_JUDGE_API_KEY is absent.
 * The returned client's .judge() calls are single completions; use
 * judgeBinary() for the best-of-3 majority-vote wrapper.
 */
export function createJudgeClient(): JudgeClient {
  const apiKey = process.env.LLM_JUDGE_API_KEY
  const baseURL = process.env.LLM_JUDGE_BASE_URL
  if (!apiKey) {
    throw new Error(
      'LLM_JUDGE_API_KEY absent — run pnpm eval:slow with env set, ' +
      'or set LLM_JUDGE_API_KEY in .env.local for local runs.',
    )
  }

  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) })

  return {
    async judge(prompt: string): Promise<0 | 1> {
      const resp = await client.chat.completions.create({
        model: process.env.LLM_JUDGE_MODEL ?? 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a strict binary judge. Respond with exactly 1 or 0. Nothing else.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        max_tokens: 2,
      })
      const raw = resp.choices[0]?.message?.content?.trim() ?? '0'
      // Accept '1', '1.', ' 1\n', etc. — anything starting with '1' is a pass.
      return raw.startsWith('1') ? 1 : 0
    },
  }
}

/**
 * Best-of-3 majority vote. Calls judge.judge() three times in parallel and
 * returns 1 if at least 2 of 3 calls return 1, otherwise 0.
 *
 * Prevents a single flaky judge call from failing the suite gate.
 */
export async function judgeBinary(client: JudgeClient, prompt: string): Promise<0 | 1> {
  const votes = await Promise.all([
    client.judge(prompt),
    client.judge(prompt),
    client.judge(prompt),
  ])
  return votes.filter(v => v === 1).length >= 2 ? 1 : 0
}
