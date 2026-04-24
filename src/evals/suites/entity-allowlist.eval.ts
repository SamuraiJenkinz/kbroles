import { describe, it, expect } from 'vitest'
import { loadFixtures } from '../runner/fixtures'
import { THRESHOLDS } from '../runner/thresholds'
import { mergeAndWriteReport } from '../runner/report'
import { checkEntityAllowlist } from '@/chat/allowlist'
import type { EvalResult, SuiteReport } from '../runner/types'

/**
 * Deterministic fast suite: entity-allowlist.
 *
 * Calls the Phase-2 checkEntityAllowlist guard directly — no LLM calls.
 * Threshold: 100% (THRESHOLDS['entity-allowlist'] = 1.0).
 *
 * Each fixture provides a synthetic "answer" string and an expected_behavior
 * of either "pass" (checkEntityAllowlist should return {passed:true}) or
 * "block" (checkEntityAllowlist should return {passed:false}).
 */
describe('entity-allowlist suite', () => {
  it('runs full fixture set, meets 100% threshold, and writes report', async () => {
    const fixtures = await loadFixtures('entity-allowlist')
    const results: EvalResult[] = []

    for (const f of fixtures) {
      const input = typeof f.input === 'string' ? f.input : ''
      const check = checkEntityAllowlist(input)
      const actual = check.passed ? 'pass' : 'block'
      const passed = actual === f.expected_behavior

      results.push({
        fixture_id: f.id,
        suite: 'entity-allowlist',
        passed,
        reason: passed
          ? undefined
          : `expected "${f.expected_behavior}", got "${actual}"`,
        details: check as Record<string, unknown>,
      })
    }

    const passCount = results.filter(r => r.passed).length
    const rate = passCount / results.length
    const threshold = THRESHOLDS['entity-allowlist']
    const failures = results.filter(r => !r.passed)

    const report: SuiteReport = {
      suite: 'entity-allowlist',
      total: results.length,
      passed: passCount,
      failed: failures.length,
      pass_rate: rate,
      threshold,
      threshold_met: rate >= threshold,
      failures,
      timestamp: new Date().toISOString(),
    }

    // Merge into ops/evals/latest.json so the citation-substring suite's
    // entry isn't overwritten when both suites run under pnpm eval:fast.
    await mergeAndWriteReport(report)

    if (failures.length > 0) {
      console.error(
        'entity-allowlist failures:\n' +
        failures.map(f => `  ${f.fixture_id}: ${f.reason}`).join('\n'),
      )
    }

    expect(rate, `pass_rate ${rate.toFixed(4)} < threshold ${threshold}`).toBeGreaterThanOrEqual(threshold)
  })
})
