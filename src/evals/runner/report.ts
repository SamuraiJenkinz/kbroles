import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { SuiteReport, RunReport } from './types'

const OUT_DIR = path.join(process.cwd(), 'ops/evals')
const OUT_FILE = path.join(OUT_DIR, 'latest.json')

/**
 * Write a fresh RunReport containing exactly the provided suites.
 * Overwrites ops/evals/latest.json. Use mergeAndWriteReport when running
 * individual suites that should accumulate into the same report file.
 */
export async function writeReport(suites: SuiteReport[]): Promise<RunReport> {
  const report: RunReport = {
    run_id: process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`,
    timestamp: new Date().toISOString(),
    suites,
    all_thresholds_met: suites.every(s => s.threshold_met),
  }
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_FILE, JSON.stringify(report, null, 2), 'utf8')
  return report
}

/**
 * Read the existing ops/evals/latest.json report, replace the entry for
 * newSuite.suite (or append if not present), recompute all_thresholds_met,
 * and write back. This prevents sequential suites from overwriting each
 * other's entries when running eval:fast (which runs multiple suites).
 *
 * If no existing report is found, creates a fresh one containing only newSuite.
 */
export async function mergeAndWriteReport(newSuite: SuiteReport): Promise<RunReport> {
  const existing = await readLatest()

  let suites: SuiteReport[]
  let run_id: string

  if (existing) {
    // Replace matching suite entry or append.
    const others = existing.suites.filter(s => s.suite !== newSuite.suite)
    suites = [...others, newSuite]
    run_id = existing.run_id
  } else {
    suites = [newSuite]
    run_id = process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`
  }

  const report: RunReport = {
    run_id,
    timestamp: new Date().toISOString(),
    suites,
    all_thresholds_met: suites.every(s => s.threshold_met),
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_FILE, JSON.stringify(report, null, 2), 'utf8')
  return report
}

/**
 * Read ops/evals/latest.json. Returns null if not present or unreadable.
 */
export async function readLatest(): Promise<RunReport | null> {
  try {
    return JSON.parse(await readFile(OUT_FILE, 'utf8')) as RunReport
  } catch {
    return null
  }
}
