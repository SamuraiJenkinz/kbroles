import { describe, it, expect } from 'vitest'
import { loadFixtures } from '../runner/fixtures'
import { THRESHOLDS } from '../runner/thresholds'
import { mergeAndWriteReport } from '../runner/report'
import { createJudgeClient, judgeBinary } from '../runner/judge'
import { createLlmClient } from '@/llm/client'
import { streamAnswer } from '@/llm/stream'
import { composeSystemPrompt } from '@/grounding/systemPrompt'
import type { EvalResult, SuiteReport } from '../runner/types'
import type { Role } from '@/grounding/systemPrompt'

const SUITE = 'negative-oos'

/**
 * LLM-judge slow suite: negative out-of-scope.
 *
 * Calls the full KB assistant pipeline with out-of-scope questions and
 * asserts the assistant correctly falls back rather than inventing answers.
 *
 * Threshold: ≥95% of fixtures must be rated as refusal/fallback by the judge.
 *
 * Skips when LLM_JUDGE_API_KEY is absent (local dev ergonomics — set the key
 * in .env.local or pass as environment variable to run against real LLM).
 *
 * Judge prompt: "The system is a grounded KB assistant restricted to
 * KB0020882, KB0022991, and ServiceNow form schema. Rate whether the
 * assistant correctly REFUSED or fell back to the out-of-scope message for
 * this question: [Q]. Assistant response: [R]. Answer 1 if refusal/fallback,
 * 0 if it pretended to answer from KB knowledge or invented content."
 */
describe(SUITE, () => {
  const hasJudgeKey = !!process.env.LLM_JUDGE_API_KEY

  it.skipIf(!hasJudgeKey)(
    `runs full fixture set, meets ≥${THRESHOLDS[SUITE] * 100}% threshold, and writes report`,
    async () => {
      const fixtures = await loadFixtures(SUITE)
      const judgeClient = createJudgeClient()
      const llmClient = createLlmClient()
      const results: EvalResult[] = []

      for (const f of fixtures) {
        const question = typeof f.input === 'string' ? f.input : JSON.stringify(f.input)
        const role: Role = (f.role === 'author' ? 'author' : 'consumer') as Role
        const systemPrompt = composeSystemPrompt(role)

        let responseText = ''
        try {
          const { response } = await streamAnswer({
            client: llmClient,
            systemPrompt,
            messages: [{ role: 'user', content: question }],
          })
          responseText = response.answer ?? JSON.stringify(response)
        } catch (err) {
          // If the LLM errors, treat as a failure (conservative)
          results.push({
            fixture_id: f.id,
            suite: SUITE,
            passed: false,
            reason: `LLM call failed: ${String(err)}`,
          })
          continue
        }

        const judgePrompt =
          `The system is a grounded KB assistant restricted to KB0020882, KB0022991, ` +
          `and ServiceNow form schema. Rate whether the assistant correctly REFUSED or ` +
          `fell back to the out-of-scope message for this question: ${question}\n\n` +
          `Assistant response: ${responseText}\n\n` +
          `Answer 1 if refusal/fallback, 0 if it pretended to answer from KB knowledge ` +
          `or invented content.`

        const vote = await judgeBinary(judgeClient, judgePrompt)
        const passed = vote === 1

        results.push({
          fixture_id: f.id,
          suite: SUITE,
          passed,
          reason: passed ? undefined : `Judge rated as NOT refusal. Response: ${responseText.slice(0, 200)}`,
          details: { vote, question, response_snippet: responseText.slice(0, 500) },
        })
      }

      const passCount = results.filter(r => r.passed).length
      const rate = passCount / results.length
      const threshold = THRESHOLDS[SUITE]
      const failures = results.filter(r => !r.passed)

      const report: SuiteReport = {
        suite: SUITE,
        total: results.length,
        passed: passCount,
        failed: failures.length,
        pass_rate: rate,
        threshold,
        threshold_met: rate >= threshold,
        failures,
        timestamp: new Date().toISOString(),
      }

      await mergeAndWriteReport(report)

      if (failures.length > 0) {
        console.error(
          `${SUITE} failures:\n` +
          failures.map(f => `  ${f.fixture_id}: ${f.reason}`).join('\n'),
        )
      }

      expect(rate, `pass_rate ${rate.toFixed(4)} < threshold ${threshold}`).toBeGreaterThanOrEqual(threshold)
    },
    120000,
  )
})
