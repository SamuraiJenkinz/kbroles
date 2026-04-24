import { describe, it, expect } from 'vitest'
import { loadFixtures } from '../runner/fixtures'
import { THRESHOLDS } from '../runner/thresholds'
import { mergeAndWriteReport } from '../runner/report'
import { createJudgeClient, judgeBinary } from '../runner/judge'
import { createLlmClient } from '@/llm/client'
import { streamAnswer } from '@/llm/stream'
import { composeSystemPrompt } from '@/grounding/systemPrompt'
import type { EvalResult, SuiteReport, EvalFixture } from '../runner/types'

const SUITE = 'paired-role'

/**
 * LLM-judge slow suite: paired-role entailment.
 *
 * For each pair (linked by pair_id in notes), calls the KB assistant twice —
 * once as consumer, once as author — with the same question. Asserts the
 * author answer contains author-specific details (workflow, approver, resolution
 * field, etc.) that the consumer answer does NOT.
 *
 * Threshold: ≥98% of pairs must pass (at most ~1 mis-routed pair in 50).
 *
 * Fixture notes convention: "pair_id:<ID>" links consumer + author halves.
 *
 * Skips when LLM_JUDGE_API_KEY is absent (local dev ergonomics).
 *
 * Judge prompt: "Question: [Q]. Consumer answer: [Ra]. Author answer: [Rb].
 * Does the author answer contain author-specific details (workflow, approver,
 * resolution-field lint, security rule) that the consumer answer does NOT?
 * Answer 1 if yes (role differentiation present), 0 if no."
 */
describe(SUITE, () => {
  const hasJudgeKey = !!process.env.LLM_JUDGE_API_KEY

  it.skipIf(!hasJudgeKey)(
    `runs full fixture set, meets ≥${THRESHOLDS[SUITE] * 100}% threshold, and writes report`,
    async () => {
      const fixtures = await loadFixtures(SUITE)
      const judgeClient = createJudgeClient()
      const llmClient = createLlmClient()

      // ── Group fixtures by pair_id extracted from notes ──────────────────
      function extractPairId(f: EvalFixture): string | null {
        if (!f.notes) return null
        const m = f.notes.match(/pair_id:([^\s.]+)/)
        return m ? m[1] : null
      }

      type PairGroup = { consumer?: EvalFixture; author?: EvalFixture }
      const pairMap = new Map<string, PairGroup>()

      for (const f of fixtures) {
        const pairId = extractPairId(f)
        if (!pairId) continue
        if (!pairMap.has(pairId)) pairMap.set(pairId, {})
        const group = pairMap.get(pairId)!
        if (f.role === 'consumer') {
          group.consumer = f
        } else if (f.role === 'author') {
          group.author = f
        }
      }

      const results: EvalResult[] = []

      for (const [pairId, { consumer, author }] of pairMap) {
        if (!consumer || !author) {
          results.push({
            fixture_id: `pair-${pairId}`,
            suite: SUITE,
            passed: false,
            reason: `Pair ${pairId} is incomplete: missing ${!consumer ? 'consumer' : 'author'} fixture`,
          })
          continue
        }

        const question = typeof consumer.input === 'string'
          ? consumer.input
          : JSON.stringify(consumer.input)

        // ── Get consumer answer ─────────────────────────────────────────
        let consumerResponse = ''
        try {
          const { response } = await streamAnswer({
            client: llmClient,
            systemPrompt: composeSystemPrompt('consumer'),
            messages: [{ role: 'user', content: question }],
          })
          consumerResponse = response.answer ?? JSON.stringify(response)
        } catch (err) {
          results.push({
            fixture_id: consumer.id,
            suite: SUITE,
            passed: false,
            reason: `Consumer LLM call failed: ${String(err)}`,
          })
          continue
        }

        // ── Get author answer ───────────────────────────────────────────
        let authorResponse = ''
        try {
          const { response } = await streamAnswer({
            client: llmClient,
            systemPrompt: composeSystemPrompt('author'),
            messages: [{ role: 'user', content: question }],
          })
          authorResponse = response.answer ?? JSON.stringify(response)
        } catch (err) {
          results.push({
            fixture_id: author.id,
            suite: SUITE,
            passed: false,
            reason: `Author LLM call failed: ${String(err)}`,
          })
          continue
        }

        // ── Judge the pair ──────────────────────────────────────────────
        const judgePrompt =
          `Question: ${question}\n\n` +
          `Consumer answer: ${consumerResponse}\n\n` +
          `Author answer: ${authorResponse}\n\n` +
          `Does the author answer contain author-specific details (workflow, approver, ` +
          `resolution-field lint, security rule) that the consumer answer does NOT? ` +
          `Answer 1 if yes (role differentiation present), 0 if no.`

        const vote = await judgeBinary(judgeClient, judgePrompt)
        const passed = vote === 1

        results.push({
          fixture_id: `${consumer.id}+${author.id}`,
          suite: SUITE,
          passed,
          reason: passed
            ? undefined
            : `Judge found no role differentiation. Consumer: ${consumerResponse.slice(0, 150)} | Author: ${authorResponse.slice(0, 150)}`,
          details: {
            vote,
            pairId,
            question,
            consumer_snippet: consumerResponse.slice(0, 300),
            author_snippet: authorResponse.slice(0, 300),
          },
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
    240000,
  )
})
