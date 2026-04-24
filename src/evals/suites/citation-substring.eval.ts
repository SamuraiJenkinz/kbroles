import { describe, it, expect } from 'vitest'
import { loadFixtures } from '../runner/fixtures'
import { THRESHOLDS } from '../runner/thresholds'
import { mergeAndWriteReport } from '../runner/report'
import { validateCitations } from '@/grounding/validator'
import { REGISTRY } from '@/grounding/registry'
import type { KbResponse } from '@/grounding/schema'
import type { EvalResult, SuiteReport } from '../runner/types'

/**
 * Deterministic fast suite: citation-substring.
 *
 * Calls the Phase-1 validateCitations guard directly — no LLM calls.
 * Threshold: 99% (THRESHOLDS['citation-substring'] = 0.99).
 *
 * Fixture expected_behavior values:
 *   "pass"  — validateCitations returns can_answer=true with citations intact
 *   "strip" — validateCitations strips the citation (can_answer flipped to
 *             false or citation array reduced) because quote doesn't match
 *             source, source_id unknown, or section_id unknown
 *
 * Note on role: validateCitations does not take a role parameter — it
 * operates purely on the KbResponse shape and the registry. The role field
 * on fixtures is metadata only (useful for audit; not passed to the guard).
 */
describe('citation-substring suite', () => {
  it('runs full fixture set, meets ≥99% threshold, and writes report', async () => {
    const fixtures = await loadFixtures('citation-substring')
    const results: EvalResult[] = []

    for (const f of fixtures) {
      const inputStr = typeof f.input === 'string' ? f.input : JSON.stringify(f.input)
      let response: KbResponse

      try {
        response = JSON.parse(inputStr) as KbResponse
      } catch (err) {
        results.push({
          fixture_id: f.id,
          suite: 'citation-substring',
          passed: false,
          reason: `fixture input is not valid JSON: ${String(err)}`,
        })
        continue
      }

      const result = validateCitations(response, REGISTRY)

      let actual: string
      let passed: boolean

      if (f.expected_behavior === 'pass') {
        // Pass: can_answer must remain true AND at least one citation survived
        const citationSurvived = result.can_answer === true && result.citations.length > 0
        actual = citationSurvived ? 'pass' : 'strip'
        passed = citationSurvived
      } else if (f.expected_behavior === 'strip') {
        // Strip: validator must have flipped can_answer to false (total strip)
        // OR reduced citations (partial strip — at least one flip recorded)
        const wasStripped = result.can_answer === false || result._flips.length > 0
        actual = wasStripped ? 'strip' : 'pass'
        passed = wasStripped
      } else {
        // Unknown expected_behavior — treat as configuration error
        actual = 'unknown'
        passed = false
      }

      results.push({
        fixture_id: f.id,
        suite: 'citation-substring',
        passed,
        reason: passed
          ? undefined
          : `expected "${f.expected_behavior}", got "${actual}" (can_answer=${result.can_answer}, citations=${result.citations.length}, flips=${result._flips.length})`,
        details: {
          can_answer: result.can_answer,
          citations_count: result.citations.length,
          flips_count: result._flips.length,
          flips: result._flips,
        } as Record<string, unknown>,
      })
    }

    const passCount = results.filter(r => r.passed).length
    const rate = passCount / results.length
    const threshold = THRESHOLDS['citation-substring']
    const failures = results.filter(r => !r.passed)

    const report: SuiteReport = {
      suite: 'citation-substring',
      total: results.length,
      passed: passCount,
      failed: failures.length,
      pass_rate: rate,
      threshold,
      threshold_met: rate >= threshold,
      failures,
      timestamp: new Date().toISOString(),
    }

    // Merge into ops/evals/latest.json so this suite's entry accumulates
    // alongside entity-allowlist when both run under pnpm eval:fast.
    await mergeAndWriteReport(report)

    if (failures.length > 0) {
      console.error(
        'citation-substring failures:\n' +
        failures.map(f => `  ${f.fixture_id}: ${f.reason}`).join('\n'),
      )
    }

    expect(rate, `pass_rate ${rate.toFixed(4)} < threshold ${threshold}`).toBeGreaterThanOrEqual(threshold)
  })
})
