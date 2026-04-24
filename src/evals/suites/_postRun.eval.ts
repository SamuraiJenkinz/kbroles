import { describe, it, afterAll } from 'vitest'
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { readLatest } from '../runner/report'
import { computeFlakes, writeFlakeReport } from '../runner/flakeQuarantine'
import type { RunReport } from '../runner/types'

const EVALS_DIR = path.join(process.cwd(), 'ops/evals')
const HISTORY_DIR = path.join(EVALS_DIR, 'history')
const LATEST_FILE = path.join(EVALS_DIR, 'latest.json')
const HISTORY_KEEP = 10

/**
 * Post-run eval suite — runs last alphabetically (prefixed with `_`).
 *
 * Responsibilities:
 *   1. Archive ops/evals/latest.json → ops/evals/history/<ISO-timestamp>.json.
 *   2. Prune history directory to keep at most 10 most recent files.
 *   3. Load last 3 history entries and run flake detection.
 *   4. If flaky fixtures detected, append to ops/evals/flaky-review.json.
 *
 * This file is intentionally ordered last by filename to ensure all eval
 * suites have called mergeAndWriteReport before archival runs.
 *
 * History timestamp format: YYYY-MM-DDTHH-mm-ss to use as valid filenames
 * (colons in ISO format are not valid on Windows file systems).
 */

/** Format date as YYYY-MM-DDTHH-mm-ss (filesystem-safe). */
function toFileTimestamp(d: Date): string {
  return d.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z')
}

/** Read up to N most recent RunReport files from history/, most-recent-first. */
async function readHistoryReports(n: number): Promise<RunReport[]> {
  let files: string[]
  try {
    files = await readdir(HISTORY_DIR)
  } catch {
    return []
  }

  const jsonFiles = files
    .filter(f => f.endsWith('.json'))
    .sort() // ISO filenames sort chronologically
    .reverse() // most recent first
    .slice(0, n)

  const reports: RunReport[] = []
  for (const f of jsonFiles) {
    try {
      const { readFile } = await import('node:fs/promises')
      const raw = await readFile(path.join(HISTORY_DIR, f), 'utf8')
      reports.push(JSON.parse(raw) as RunReport)
    } catch {
      // Corrupt history file — skip
    }
  }
  return reports
}

describe('_postRun (archive + flake sweep)', () => {
  it('archives latest.json to history and sweeps for flaky fixtures', async () => {
    // 1. Archive latest.json → history/<timestamp>.json
    await mkdir(HISTORY_DIR, { recursive: true })

    const timestamp = toFileTimestamp(new Date())
    const archivePath = path.join(HISTORY_DIR, `${timestamp}.json`)

    try {
      await copyFile(LATEST_FILE, archivePath)
    } catch {
      // latest.json may not exist if all suites were skipped (no-judge-key run)
      // In that case, archival is a no-op.
      console.warn('_postRun: ops/evals/latest.json not found — skipping archive')
      return
    }

    // 2. Prune history to keep at most HISTORY_KEEP most recent files
    try {
      const files = (await readdir(HISTORY_DIR))
        .filter(f => f.endsWith('.json'))
        .sort() // chronological
      if (files.length > HISTORY_KEEP) {
        const toDelete = files.slice(0, files.length - HISTORY_KEEP)
        await Promise.all(
          toDelete.map(f => rm(path.join(HISTORY_DIR, f), { force: true })),
        )
      }
    } catch {
      // Non-fatal pruning failure — history will just grow slightly
      console.warn('_postRun: could not prune history directory')
    }

    // 3. Load last 3 history reports (most-recent-first) for flake detection
    const last3 = await readHistoryReports(3)

    if (last3.length < 2) {
      // Not enough history to compute variance — skip flake sweep
      return
    }

    // 4. Compute and write flakes
    const flakes = await computeFlakes(last3)
    if (flakes.length > 0) {
      await writeFlakeReport(flakes)
      console.warn(
        `_postRun: ${flakes.length} flaky fixture(s) detected and written to ops/evals/flaky-review.json:\n` +
        flakes.map(f => `  ${f.fixture_id} (${f.suite}) variance=${f.variance_pp}pp`).join('\n'),
      )
    }
  }, 30000)
})
