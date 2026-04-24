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

const SUITE = 'positional'

/**
 * LLM-judge slow suite: positional turn-1 vs turn-8 entailment.
 *
 * Tests whether the KB assistant answers the anchor question equally well
 * regardless of its position in the conversation (turn-1 vs turn-8).
 * This directly addresses ROADMAP Pitfall 3 (multi-turn positional bias).
 *
 * For each fixture:
 *   - The anchor question is extracted from input.turns[0].
 *   - Filler questions are parsed from the notes field (JSON array).
 *   - Conversation A: anchor at turn-1, followed by 7 filler turns.
 *   - Conversation B: 7 filler turns, followed by anchor at turn-8.
 *   - Both responses are judged: "Does this answer specifically address [anchor_topic]?"
 *   - t1_pass_rate and t8_pass_rate computed; delta = |t1 - t8|.
 *
 * Threshold: delta ≤ THRESHOLDS['positional'] (0.02 = 2 percentage points).
 * The SuiteReport.pass_rate stores (1 - delta) for compatibility with the
 * RunReport/all_thresholds_met aggregation. A custom `positional_delta` field
 * in the first failure entry's details holds the raw delta for the workbook
 * KQL query: `customDimensions.positional_delta`.
 *
 * Call pattern: direct LLM call via createLlmClient + streamAnswer — NOT HTTP
 * to /api/chat, which would require a running server in CI. Per RESEARCH.md
 * §Pattern 9.
 *
 * Skips when LLM_JUDGE_API_KEY is absent (local dev ergonomics).
 */
describe(SUITE, () => {
  const hasJudgeKey = !!process.env.LLM_JUDGE_API_KEY

  it.skipIf(!hasJudgeKey)(
    `runs positional turn-1 vs turn-8, asserts |t1-t8| ≤ ${THRESHOLDS[SUITE] * 100}pp, and writes report`,
    async () => {
      const fixtures = await loadFixtures(SUITE)
      const judgeClient = createJudgeClient()
      const llmClient = createLlmClient()

      /** Parse filler questions from notes field. */
      function parseFiller(notes: string | undefined): string[] {
        if (!notes) return []
        const m = notes.match(/filler:\s*(\[[\s\S]*?\])/)
        if (!m) return []
        try {
          return JSON.parse(m[1]) as string[]
        } catch {
          return []
        }
      }

      /** Parse anchor_topic from notes field. */
      function parseAnchorTopic(notes: string | undefined): string {
        if (!notes) return 'the topic'
        const m = notes.match(/anchor_topic:\s*([^.]+)/)
        return m ? m[1].trim() : 'the topic'
      }

      /**
       * Build a conversation for the LLM from a turns array, getting a response
       * to the LAST user turn. Each filler turn is simulated as user→assistant
       * where the assistant response is a brief in-scope or out-of-scope fallback.
       */
      async function getResponseForAnchorAtPosition(
        anchorQuestion: string,
        fillerQuestions: string[],
        anchorPosition: 'first' | 'last',
        role: Role,
        systemPrompt: string,
      ): Promise<string> {
        type Msg = { role: 'user' | 'assistant'; content: string }
        const turns: Msg[] = []

        if (anchorPosition === 'first') {
          // Turn 1: anchor, turns 2–8: filler
          // We only send the full conversation context; the LLM's response to turn 1 is what we evaluate
          // To simulate multi-turn: send all turns in messages array, evaluate response to anchor
          turns.push({ role: 'user', content: anchorQuestion })
          // Add filler as brief simulated prior conversation context
          for (const fq of fillerQuestions.slice(0, 7)) {
            turns.push({ role: 'assistant', content: 'I can only assist with knowledge base content.' })
            turns.push({ role: 'user', content: fq })
          }
        } else {
          // anchorPosition === 'last': turns 1–7 filler, turn 8 anchor
          for (const fq of fillerQuestions.slice(0, 7)) {
            turns.push({ role: 'user', content: fq })
            turns.push({ role: 'assistant', content: 'I can only assist with knowledge base content.' })
          }
          turns.push({ role: 'user', content: anchorQuestion })
        }

        // The last user turn is the one whose answer we want
        // For turn-1 (anchor first): we call with just the anchor as the message
        // For turn-8 (anchor last): we send the history as prior context, anchor as last user msg
        const anchorTurn = anchorPosition === 'first'
          ? [{ role: 'user' as const, content: anchorQuestion }]
          : [
              ...fillerQuestions.slice(0, 7).flatMap(fq => [
                { role: 'user' as const, content: fq },
                { role: 'assistant' as const, content: 'I can only assist with knowledge base content.' },
              ]),
              { role: 'user' as const, content: anchorQuestion },
            ]

        const { response } = await streamAnswer({
          client: llmClient,
          systemPrompt,
          messages: anchorTurn,
        })
        return response.answer ?? JSON.stringify(response)
      }

      const t1Results: EvalResult[] = []
      const t8Results: EvalResult[] = []
      const allResults: EvalResult[] = []

      for (const f of fixtures) {
        const anchorQuestion = Array.isArray((f.input as { turns?: Array<{ role: string; content: string }> })?.turns)
          ? ((f.input as { turns: Array<{ role: string; content: string }> }).turns[0]?.content ?? '')
          : (typeof f.input === 'string' ? f.input : '')

        const fillerQuestions = parseFiller(f.notes)
        const anchorTopic = parseAnchorTopic(f.notes)
        const role: Role = (f.role === 'author' ? 'author' : 'consumer') as Role
        const systemPrompt = composeSystemPrompt(role)

        // ── Turn-1 response ─────────────────────────────────────────────
        let t1Response = ''
        let t1Error = false
        try {
          t1Response = await getResponseForAnchorAtPosition(
            anchorQuestion, fillerQuestions, 'first', role, systemPrompt,
          )
        } catch (err) {
          t1Error = true
          t1Results.push({
            fixture_id: `${f.id}-t1`,
            suite: SUITE,
            passed: false,
            reason: `Turn-1 LLM call failed: ${String(err)}`,
          })
        }

        // ── Turn-8 response ─────────────────────────────────────────────
        let t8Response = ''
        let t8Error = false
        try {
          t8Response = await getResponseForAnchorAtPosition(
            anchorQuestion, fillerQuestions, 'last', role, systemPrompt,
          )
        } catch (err) {
          t8Error = true
          t8Results.push({
            fixture_id: `${f.id}-t8`,
            suite: SUITE,
            passed: false,
            reason: `Turn-8 LLM call failed: ${String(err)}`,
          })
        }

        if (t1Error || t8Error) continue

        // ── Judge both responses ────────────────────────────────────────
        const makeJudgePrompt = (response: string) =>
          `Anchor topic: ${anchorTopic}. ` +
          `Assistant answer: ${response}\n\n` +
          `Does the answer correctly and specifically address this topic? ` +
          `Answer 1 if yes, 0 if no.`

        const [t1Vote, t8Vote] = await Promise.all([
          judgeBinary(judgeClient, makeJudgePrompt(t1Response)),
          judgeBinary(judgeClient, makeJudgePrompt(t8Response)),
        ])

        t1Results.push({
          fixture_id: `${f.id}-t1`,
          suite: SUITE,
          passed: t1Vote === 1,
          details: { turn: 1, vote: t1Vote, anchor_topic: anchorTopic },
        })

        t8Results.push({
          fixture_id: `${f.id}-t8`,
          suite: SUITE,
          passed: t8Vote === 1,
          details: { turn: 8, vote: t8Vote, anchor_topic: anchorTopic },
        })

        allResults.push(
          {
            fixture_id: `${f.id}-t1`,
            suite: SUITE,
            passed: t1Vote === 1,
            details: { turn: 1, vote: t1Vote, anchor_topic: anchorTopic },
          },
          {
            fixture_id: `${f.id}-t8`,
            suite: SUITE,
            passed: t8Vote === 1,
            details: { turn: 8, vote: t8Vote, anchor_topic: anchorTopic },
          },
        )
      }

      // ── Compute delta ─────────────────────────────────────────────────
      const t1Count = t1Results.filter(r => r.passed).length
      const t8Count = t8Results.filter(r => r.passed).length
      const fixtureCount = Math.max(t1Results.length, 1)

      const t1PassRate = t1Count / fixtureCount
      const t8PassRate = t8Count / fixtureCount
      const delta = Math.abs(t1PassRate - t8PassRate)
      const threshold = THRESHOLDS[SUITE] // 0.02 = 2pp delta allowance

      // pass_rate stored as (1 - delta) so it's compatible with the RunReport
      // aggregation (higher = better). The workbook reads `positional_delta`
      // from the first failure entry's details for the actual delta value.
      const passRate = 1 - delta
      const thresholdMet = delta <= threshold

      const failures = allResults.filter(r => !r.passed)

      // Inject positional_delta into the first failure details for the workbook KQL.
      if (failures.length > 0 && failures[0].details) {
        ;(failures[0].details as Record<string, unknown>).positional_delta = delta
      } else if (!thresholdMet) {
        failures.push({
          fixture_id: 'positional-delta',
          suite: SUITE,
          passed: false,
          reason: `delta ${(delta * 100).toFixed(2)}pp > threshold ${threshold * 100}pp`,
          details: {
            positional_delta: delta,
            t1_pass_rate: t1PassRate,
            t8_pass_rate: t8PassRate,
          },
        })
      }

      const report: SuiteReport = {
        suite: SUITE,
        total: allResults.length,
        passed: allResults.filter(r => r.passed).length,
        failed: failures.length,
        pass_rate: passRate,
        threshold,
        threshold_met: thresholdMet,
        failures,
        timestamp: new Date().toISOString(),
      }

      await mergeAndWriteReport(report)

      if (!thresholdMet) {
        console.error(
          `${SUITE} FAILED: delta=${(delta * 100).toFixed(2)}pp, ` +
          `t1_pass_rate=${(t1PassRate * 100).toFixed(1)}%, ` +
          `t8_pass_rate=${(t8PassRate * 100).toFixed(1)}%`,
        )
      }

      expect(
        delta,
        `positional delta ${(delta * 100).toFixed(2)}pp > threshold ${threshold * 100}pp ` +
        `(t1=${(t1PassRate * 100).toFixed(1)}%, t8=${(t8PassRate * 100).toFixed(1)}%)`,
      ).toBeLessThanOrEqual(threshold)
    },
    300000,
  )
})
