import { describe, it, expect, afterEach } from 'vitest'
import { rm, readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { computeFlakes, writeFlakeReport } from '../flakeQuarantine'
import type { RunReport, SuiteReport, EvalResult } from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResult(fixture_id: string, suite: string, passed: boolean): EvalResult {
  return { fixture_id, suite, passed, reason: passed ? undefined : 'test failure' }
}

function makeSuiteReport(suite: string, failures: EvalResult[]): SuiteReport {
  const total = 5
  const failed = failures.length
  const passed = total - failed
  return {
    suite,
    total,
    passed,
    failed,
    pass_rate: passed / total,
    threshold: 0.95,
    threshold_met: passed / total >= 0.95,
    failures,
    timestamp: new Date().toISOString(),
  }
}

function makeRunReport(suites: SuiteReport[]): RunReport {
  return {
    run_id: `test-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    suites,
    all_thresholds_met: suites.every(s => s.threshold_met),
  }
}

// ── computeFlakes ─────────────────────────────────────────────────────────────

describe('computeFlakes', () => {
  it('returns empty array when all fixtures are stable across 3 runs', async () => {
    // fixture "neg-oos-001" fails in ALL 3 runs — stable (consistently failing)
    const failure = makeResult('neg-oos-001', 'negative-oos', false)
    const run1 = makeRunReport([makeSuiteReport('negative-oos', [failure])])
    const run2 = makeRunReport([makeSuiteReport('negative-oos', [failure])])
    const run3 = makeRunReport([makeSuiteReport('negative-oos', [failure])])

    const flakes = await computeFlakes([run1, run2, run3])
    // neg-oos-001 fails in all 3 runs: rates=[0,0,0], variance=0pp → not flaky
    expect(flakes).toHaveLength(0)
  })

  it('returns empty array when fixtures pass in all 3 runs', async () => {
    // No failures at all → nothing in the failures arrays
    const run1 = makeRunReport([makeSuiteReport('negative-oos', [])])
    const run2 = makeRunReport([makeSuiteReport('negative-oos', [])])
    const run3 = makeRunReport([makeSuiteReport('negative-oos', [])])

    const flakes = await computeFlakes([run1, run2, run3])
    expect(flakes).toHaveLength(0)
  })

  it('returns the flipping fixture when it fails in run 2 only', async () => {
    const failure = makeResult('neg-oos-002', 'negative-oos', false)

    // run1: passes (no failure)
    const run1 = makeRunReport([makeSuiteReport('negative-oos', [])])
    // run2: fails
    const run2 = makeRunReport([makeSuiteReport('negative-oos', [failure])])
    // run3: passes again (no failure)
    const run3 = makeRunReport([makeSuiteReport('negative-oos', [])])

    const flakes = await computeFlakes([run1, run2, run3])
    expect(flakes).toHaveLength(1)
    expect(flakes[0].fixture_id).toBe('neg-oos-002')
    expect(flakes[0].suite).toBe('negative-oos')
    // rates: [1, 0, 1] — variance = (1 - 0) * 100 = 100pp
    expect(flakes[0].per_run_pass_rate).toEqual([1, 0, 1])
    expect(flakes[0].variance_pp).toBe(100)
    expect(flakes[0].quarantined_at).toBeDefined()
  })

  it('returns the flipping fixture when it fails in run 1 only', async () => {
    const failure = makeResult('pos-001', 'positional', false)

    const run1 = makeRunReport([makeSuiteReport('positional', [failure])])
    const run2 = makeRunReport([makeSuiteReport('positional', [])])
    const run3 = makeRunReport([makeSuiteReport('positional', [])])

    const flakes = await computeFlakes([run1, run2, run3])
    expect(flakes).toHaveLength(1)
    expect(flakes[0].fixture_id).toBe('pos-001')
    // rates: [0, 1, 1] — variance = 100pp
    expect(flakes[0].per_run_pass_rate).toEqual([0, 1, 1])
    expect(flakes[0].variance_pp).toBe(100)
  })

  it('returns empty array when only 1 report is provided (need ≥2 to compare)', async () => {
    const failure = makeResult('neg-oos-003', 'negative-oos', false)
    const run1 = makeRunReport([makeSuiteReport('negative-oos', [failure])])

    const flakes = await computeFlakes([run1])
    expect(flakes).toHaveLength(0)
  })

  it('handles multiple flaky fixtures across different suites', async () => {
    const failure1 = makeResult('neg-oos-004', 'negative-oos', false)
    const failure2 = makeResult('inj-001', 'injection-refuse', false)

    // run1: both fail
    const run1 = makeRunReport([
      makeSuiteReport('negative-oos', [failure1]),
      makeSuiteReport('injection-refuse', [failure2]),
    ])
    // run2: both pass
    const run2 = makeRunReport([
      makeSuiteReport('negative-oos', []),
      makeSuiteReport('injection-refuse', []),
    ])
    // run3: both pass
    const run3 = makeRunReport([
      makeSuiteReport('negative-oos', []),
      makeSuiteReport('injection-refuse', []),
    ])

    const flakes = await computeFlakes([run1, run2, run3])
    expect(flakes).toHaveLength(2)
    const ids = flakes.map(f => f.fixture_id).sort()
    expect(ids).toEqual(['inj-001', 'neg-oos-004'])
  })
})

// ── writeFlakeReport ──────────────────────────────────────────────────────────

describe('writeFlakeReport', () => {
  const tmpDir = path.join(process.cwd(), 'ops/evals/.test-flake-tmp')
  const tmpFile = path.join(tmpDir, 'flaky-review-test.json')

  // Temporarily override the module's FLAKY_FILE path by writing to the
  // same path the module uses — we test via the public API but clean up after.
  // Since we can't easily patch the module constant, we use the tmpdir approach
  // by verifying writeFlakeReport writes valid JSON to a temp location via
  // a partial integration: call writeFlakeReport and read back FLAKY_FILE.
  // For isolation we delete the actual file before/after each test.

  const ACTUAL_FLAKY_FILE = path.join(process.cwd(), 'ops/evals/flaky-review.json')

  afterEach(async () => {
    await rm(ACTUAL_FLAKY_FILE, { force: true })
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('writes valid JSON to ops/evals/flaky-review.json', async () => {
    const flakes = [
      {
        fixture_id: 'neg-oos-010',
        suite: 'negative-oos',
        per_run_pass_rate: [1, 0, 1],
        variance_pp: 100,
        quarantined_at: new Date().toISOString(),
      },
    ]

    await writeFlakeReport(flakes)

    const raw = await readFile(ACTUAL_FLAKY_FILE, 'utf8')
    const parsed = JSON.parse(raw) as unknown[]
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(1)
    expect((parsed[0] as { fixture_id: string }).fixture_id).toBe('neg-oos-010')
  })

  it('appends to existing entries without overwriting', async () => {
    const first = [
      {
        fixture_id: 'neg-oos-020',
        suite: 'negative-oos',
        per_run_pass_rate: [1, 0, 1],
        variance_pp: 100,
        quarantined_at: new Date().toISOString(),
      },
    ]

    const second = [
      {
        fixture_id: 'inj-002',
        suite: 'injection-refuse',
        per_run_pass_rate: [0, 1, 0],
        variance_pp: 100,
        quarantined_at: new Date().toISOString(),
      },
    ]

    await writeFlakeReport(first)
    await writeFlakeReport(second)

    const raw = await readFile(ACTUAL_FLAKY_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Array<{ fixture_id: string }>
    expect(parsed).toHaveLength(2)
    const ids = parsed.map(f => f.fixture_id).sort()
    expect(ids).toEqual(['inj-002', 'neg-oos-020'])
  })

  it('does not duplicate entries for already-quarantined fixture IDs', async () => {
    const flake = [
      {
        fixture_id: 'neg-oos-030',
        suite: 'negative-oos',
        per_run_pass_rate: [1, 0, 1],
        variance_pp: 100,
        quarantined_at: new Date().toISOString(),
      },
    ]

    await writeFlakeReport(flake)
    await writeFlakeReport(flake) // same fixture_id again

    const raw = await readFile(ACTUAL_FLAKY_FILE, 'utf8')
    const parsed = JSON.parse(raw) as unknown[]
    // Should still be 1 entry, not 2
    expect(parsed).toHaveLength(1)
  })

  it('does nothing when flakes array is empty', async () => {
    await writeFlakeReport([])
    // File should not be created
    await expect(readFile(ACTUAL_FLAKY_FILE, 'utf8')).rejects.toThrow()
  })
})
