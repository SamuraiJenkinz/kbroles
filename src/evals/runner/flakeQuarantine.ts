/**
 * Flake quarantine: compares per-fixture pass rates across the last 3 run
 * reports. A fixture is flagged as flaky if its variance (max − min of its
 * per-run pass rates, expressed in percentage points) exceeds FLAKE_THRESHOLD_PP.
 *
 * VARIANCE INTERPRETATION
 * ──────────────────────────────────────────────────────────────────────
 * Each fixture is evaluated once per run, so its per-run "pass rate" is
 * either 0 (failed that run) or 1 (passed that run). That means the only
 * non-zero variance is 1 − 0 = 1.0 in raw terms (= 100 pp). In other words,
 * the check "variance > 10 pp" really means "this fixture flipped at least
 * once across the last 3 runs". The 10 pp threshold is intentionally low to
 * catch any single flip, while still being the documented contract for future
 * multi-run-aggregated suites where a fixture could be evaluated N>1 times per
 * run (e.g. if a fixture is retried 3× for noise reduction — then the per-run
 * pass rate could be 0.33 or 0.67, and a true 10 pp drift would indicate
 * meaningful instability rather than a single lucky/unlucky call).
 *
 * APPEND BEHAVIOUR
 * ──────────────────────────────────────────────────────────────────────
 * writeFlakeReport() APPENDS to ops/evals/flaky-review.json (never overwrites).
 * A fixture quarantined in run N stays in the file until a human PR removes it,
 * even if it becomes stable in runs N+1..N+3. This is intentional: stable-again
 * fixtures should be manually reviewed before being re-trusted by CI gating.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { RunReport } from './types'

const FLAKY_FILE = path.join(process.cwd(), 'ops/evals/flaky-review.json')
const FLAKE_THRESHOLD_PP = 10 // variance in percentage points

export interface FlakyFixture {
  fixture_id: string
  suite: string
  /** Per-run pass rate (0 or 1 for single-eval suites), most-recent-last order */
  per_run_pass_rate: number[]
  /** max − min of per_run_pass_rate, expressed in percentage points (0..100) */
  variance_pp: number
  quarantined_at: string
}

/**
 * Compare per-fixture pass rates across up to 3 RunReports.
 * Returns fixtures whose variance (max − min of pass rates × 100) exceeds
 * FLAKE_THRESHOLD_PP (10 pp). See file-top comment for interpretation.
 *
 * A fixture is considered "failed in a run" if it appears in any suite's
 * failures array for that run. Otherwise it passed.
 */
export async function computeFlakes(last3Reports: RunReport[]): Promise<FlakyFixture[]> {
  if (last3Reports.length < 2) return []

  // Build a map: fixture_id → suite → per-run pass rate (0 or 1)
  // Structure: { [fixtureId]: { suite, rates: number[] } }
  const fixtureData = new Map<string, { suite: string; rates: number[] }>()

  for (const report of last3Reports) {
    // Collect all fixture IDs that FAILED in this run across all suites
    const failedIds = new Set<string>()
    for (const suite of report.suites) {
      for (const failure of suite.failures) {
        failedIds.add(failure.fixture_id)
      }
    }

    // For each suite, iterate over its failures to build fixture data.
    // We also need the full list of fixture IDs that ran — infer from
    // failures (failed = 0) vs passed (not in failures = 1).
    // Since we don't have the full fixture list in the report, we build
    // the map from failures only and treat a fixture as "passed" in runs
    // where it doesn't appear in any failure list.
    for (const suite of report.suites) {
      for (const failure of suite.failures) {
        const key = failure.fixture_id
        const existing = fixtureData.get(key)
        if (existing) {
          existing.rates.push(0)
        } else {
          fixtureData.set(key, { suite: failure.suite, rates: [0] })
        }
      }
    }
  }

  // For fixtures that don't appear in every run's failures, fill missing
  // runs with 1 (passed). We need to pad rates to match the number of reports.
  // A fixture that only appears in the failures of 1 run out of 3 will have
  // rates = [0] but we need to know it "passed" the other 2 runs.
  // Re-build more carefully: for each unique fixture seen across all runs,
  // track which run indices it failed in.
  const fixtureFailedInRun = new Map<string, { suite: string; failedRunIndices: Set<number> }>()

  for (let runIdx = 0; runIdx < last3Reports.length; runIdx++) {
    const report = last3Reports[runIdx]
    for (const suite of report.suites) {
      for (const failure of suite.failures) {
        const key = failure.fixture_id
        const existing = fixtureFailedInRun.get(key)
        if (existing) {
          existing.failedRunIndices.add(runIdx)
        } else {
          fixtureFailedInRun.set(key, {
            suite: failure.suite,
            failedRunIndices: new Set([runIdx]),
          })
        }
      }
    }
  }

  const flakes: FlakyFixture[] = []
  const numRuns = last3Reports.length

  for (const [fixtureId, { suite, failedRunIndices }] of fixtureFailedInRun) {
    const rates: number[] = []
    for (let i = 0; i < numRuns; i++) {
      rates.push(failedRunIndices.has(i) ? 0 : 1)
    }

    const min = Math.min(...rates)
    const max = Math.max(...rates)
    const variance_pp = (max - min) * 100

    if (variance_pp > FLAKE_THRESHOLD_PP) {
      flakes.push({
        fixture_id: fixtureId,
        suite,
        per_run_pass_rate: rates,
        variance_pp,
        quarantined_at: new Date().toISOString(),
      })
    }
  }

  return flakes
}

/**
 * Append new flakes to ops/evals/flaky-review.json.
 * Creates the file if it does not exist. Never overwrites existing entries.
 * De-duplicates by fixture_id so re-running doesn't create duplicate entries
 * for fixtures already quarantined in a prior run.
 */
export async function writeFlakeReport(flakes: FlakyFixture[]): Promise<void> {
  if (flakes.length === 0) return

  await mkdir(path.dirname(FLAKY_FILE), { recursive: true })

  // Read existing entries
  let existing: FlakyFixture[] = []
  try {
    const raw = await readFile(FLAKY_FILE, 'utf8')
    existing = JSON.parse(raw) as FlakyFixture[]
  } catch {
    // File doesn't exist yet — start fresh
    existing = []
  }

  // Append only new fixture IDs (don't duplicate existing entries)
  const existingIds = new Set(existing.map(f => f.fixture_id))
  const newFlakes = flakes.filter(f => !existingIds.has(f.fixture_id))

  if (newFlakes.length === 0) return

  const merged = [...existing, ...newFlakes]
  await writeFile(FLAKY_FILE, JSON.stringify(merged, null, 2), 'utf8')
}
