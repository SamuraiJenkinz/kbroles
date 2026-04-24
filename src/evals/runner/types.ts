export interface EvalFixture {
  id: string           // unique within suite, e.g. "neg-oos-001"
  suite: string        // suite name, e.g. "negative-oos"
  role?: 'consumer' | 'author'
  input: string | { turns: Array<{ role: 'user' | 'assistant'; content: string }> }
  expected_behavior: string   // free-form, judged or pattern-matched per suite
  notes?: string
  added_by?: string
  added_date?: string
  source?: string      // ServiceNow KB id or "synthetic"
}

export interface EvalResult {
  fixture_id: string
  suite: string
  passed: boolean
  reason?: string
  details?: Record<string, unknown>
}

export interface SuiteReport {
  suite: string
  total: number
  passed: number
  failed: number
  pass_rate: number       // 0..1
  threshold: number       // 0..1 from THRESHOLDS
  threshold_met: boolean
  failures: EvalResult[]
  timestamp: string       // ISO
}

export interface RunReport {
  run_id: string
  timestamp: string
  suites: SuiteReport[]
  all_thresholds_met: boolean
}
