import { describe, it, expect, afterEach } from 'vitest'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { writeReport, readLatest, mergeAndWriteReport } from '../report'
import type { SuiteReport } from '../types'

const OUT_FILE = path.join(process.cwd(), 'ops/evals/latest.json')

// Clean up the report file after each test so tests are independent.
afterEach(async () => {
  await rm(OUT_FILE, { force: true })
})

function makeSuiteReport(overrides: Partial<SuiteReport> = {}): SuiteReport {
  return {
    suite: 'test-suite',
    total: 10,
    passed: 10,
    failed: 0,
    pass_rate: 1.0,
    threshold: 1.0,
    threshold_met: true,
    failures: [],
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

describe('writeReport', () => {
  it('writes ops/evals/latest.json and returns a RunReport', async () => {
    const suite = makeSuiteReport()
    const report = await writeReport([suite])

    expect(report.suites).toHaveLength(1)
    expect(report.suites[0].suite).toBe('test-suite')
    expect(report.all_thresholds_met).toBe(true)
    expect(report.run_id).toBeDefined()
    expect(report.timestamp).toBeDefined()
  })

  it('sets all_thresholds_met=false when any suite fails threshold', async () => {
    const passing = makeSuiteReport({ suite: 'suite-a', threshold_met: true })
    const failing = makeSuiteReport({ suite: 'suite-b', threshold_met: false })
    const report = await writeReport([passing, failing])

    expect(report.all_thresholds_met).toBe(false)
  })

  it('can be read back via readLatest with correct shape', async () => {
    const suite = makeSuiteReport({ suite: 'readback-test', pass_rate: 0.95, threshold: 0.99, threshold_met: false })
    await writeReport([suite])

    const read = await readLatest()
    expect(read).not.toBeNull()
    expect(read!.suites[0].suite).toBe('readback-test')
    expect(read!.suites[0].pass_rate).toBe(0.95)
    expect(read!.suites[0].threshold_met).toBe(false)
    expect(read!.all_thresholds_met).toBe(false)
  })
})

describe('readLatest', () => {
  it('returns null when ops/evals/latest.json does not exist', async () => {
    const result = await readLatest()
    expect(result).toBeNull()
  })
})

describe('mergeAndWriteReport', () => {
  it('creates a fresh report when no existing report is present', async () => {
    const suite = makeSuiteReport({ suite: 'entity-allowlist' })
    const report = await mergeAndWriteReport(suite)

    expect(report.suites).toHaveLength(1)
    expect(report.suites[0].suite).toBe('entity-allowlist')
    expect(report.all_thresholds_met).toBe(true)
  })

  it('appends a new suite without overwriting an existing suite', async () => {
    const first = makeSuiteReport({ suite: 'entity-allowlist' })
    await mergeAndWriteReport(first)

    const second = makeSuiteReport({ suite: 'citation-substring', pass_rate: 0.99, threshold: 0.99, threshold_met: true })
    const report = await mergeAndWriteReport(second)

    expect(report.suites).toHaveLength(2)
    const names = report.suites.map(s => s.suite)
    expect(names).toContain('entity-allowlist')
    expect(names).toContain('citation-substring')
    expect(report.all_thresholds_met).toBe(true)
  })

  it('replaces an existing suite entry when rerun (same suite name)', async () => {
    const first = makeSuiteReport({ suite: 'entity-allowlist', passed: 8, failed: 2, pass_rate: 0.8, threshold_met: false })
    await mergeAndWriteReport(first)

    const updated = makeSuiteReport({ suite: 'entity-allowlist', passed: 10, failed: 0, pass_rate: 1.0, threshold_met: true })
    const report = await mergeAndWriteReport(updated)

    // Should still be only 1 entity-allowlist entry
    const entries = report.suites.filter(s => s.suite === 'entity-allowlist')
    expect(entries).toHaveLength(1)
    expect(entries[0].passed).toBe(10)
    expect(entries[0].pass_rate).toBe(1.0)
    expect(entries[0].threshold_met).toBe(true)
  })

  it('sets all_thresholds_met correctly when one of two suites fails', async () => {
    const passing = makeSuiteReport({ suite: 'entity-allowlist', threshold_met: true })
    await mergeAndWriteReport(passing)

    const failing = makeSuiteReport({ suite: 'citation-substring', threshold_met: false })
    const report = await mergeAndWriteReport(failing)

    expect(report.all_thresholds_met).toBe(false)
  })

  it('preserves existing run_id when merging into existing report', async () => {
    const first = makeSuiteReport({ suite: 'entity-allowlist' })
    const initial = await mergeAndWriteReport(first)
    const originalRunId = initial.run_id

    const second = makeSuiteReport({ suite: 'citation-substring' })
    const merged = await mergeAndWriteReport(second)

    expect(merged.run_id).toBe(originalRunId)
  })
})
