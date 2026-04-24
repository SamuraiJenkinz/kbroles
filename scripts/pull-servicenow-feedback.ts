/**
 * scripts/pull-servicenow-feedback.ts
 *
 * Monthly Content Steward pull from ServiceNow.
 * Writes rejected/outdated/draft kb_knowledge records + kb_feedback rows to
 * ops/rejected-articles/YYYY-MM.json (normal run) or
 * ops/rejected-articles/baseline-pre-pilot.json (--baseline flag).
 *
 * Usage:
 *   pnpm exec tsx scripts/pull-servicenow-feedback.ts              # current month
 *   pnpm exec tsx scripts/pull-servicenow-feedback.ts --baseline   # 90-day window
 *
 * Invoked by .github/workflows/steward-monthly.yml on the 1st of each month.
 *
 * Pre-requisite: SERVICENOW_SERVICE_ACCOUNT, SN_INSTANCE available via
 * loadSecrets() (AWS Secrets Manager at /mmc/cts/kb-assistant) or .env.local.
 */

import { loadSecrets } from '../src/config/secrets.js'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface KbRecord {
  sys_id: string
  number: string
  short_description: string
  workflow_state: string
  /** Populated from u_rejection_reason field if present on the instance. */
  rejection_reason?: string
  sys_updated_on: string
  feedback_count?: number
}

export interface PullOutput {
  captured_at: string
  window: string
  count: number
  records: KbRecord[]
}

/** Low-level GET wrapper — handles auth, URL building, error checking. */
export async function snGet(
  pathname: string,
  params: Record<string, string>,
): Promise<{ result: Record<string, unknown>[] }> {
  const sa = JSON.parse(process.env.SERVICENOW_SERVICE_ACCOUNT!) as {
    username: string
    password: string
  }
  const token = Buffer.from(`${sa.username}:${sa.password}`).toString('base64')
  const instance = process.env.SN_INSTANCE!
  const url = new URL(`https://${instance}.service-now.com${pathname}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`SN ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as { result: Record<string, unknown>[] }
}

async function main() {
  await loadSecrets()

  const isBaseline = process.argv.includes('--baseline')
  const windowLabel = isBaseline
    ? 'baseline-pre-pilot'
    : new Date().toISOString().slice(0, 7)

  // ServiceNow encoded query date range
  const rangeKql = isBaseline
    ? 'sys_updated_onONLast 90 days@javascript:gs.beginningOfLast90Days()@javascript:gs.endOfLast90Days()'
    : 'sys_updated_onONThis month@javascript:gs.beginningOfThisMonth()@javascript:gs.endOfThisMonth()'

  const kb = await snGet('/api/now/table/kb_knowledge', {
    sysparm_query: `workflow_stateINretired,outdated,draft^${rangeKql}`,
    sysparm_fields:
      'sys_id,number,short_description,workflow_state,u_rejection_reason,sys_updated_on',
    sysparm_limit: '500',
  })

  // Log a warning if results are truncated
  if (kb.result.length === 500) {
    console.warn(
      'WARN: result set capped at 500 records. ' +
        'TODO: implement pagination via X-WS-Count response header if needed.',
    )
  }

  // Correlate kb_feedback rows by article.sys_id
  const feedback = await snGet('/api/now/table/kb_feedback', {
    sysparm_query: rangeKql,
    sysparm_fields: 'article.sys_id,article.number,rating,comments,sys_created_on',
    sysparm_limit: '2000',
  })

  const feedbackByArticle = new Map<string, number>()
  for (const row of feedback.result) {
    const articleId = row['article.sys_id'] as string | undefined
    if (articleId) {
      feedbackByArticle.set(articleId, (feedbackByArticle.get(articleId) ?? 0) + 1)
    }
  }

  const records: KbRecord[] = kb.result.map((r) => {
    // u_rejection_reason may be absent on some SN instances — coerce empty
    // string / null / undefined all to undefined (not the string 'undefined').
    const rawReason = r['u_rejection_reason']
    const rejectionReason =
      typeof rawReason === 'string' && rawReason.length > 0
        ? rawReason
        : undefined

    return {
      sys_id: r['sys_id'] as string,
      number: r['number'] as string,
      short_description: r['short_description'] as string,
      workflow_state: r['workflow_state'] as string,
      rejection_reason: rejectionReason,
      sys_updated_on: r['sys_updated_on'] as string,
      feedback_count: feedbackByArticle.get(r['sys_id'] as string) ?? 0,
    }
  })

  const output: PullOutput = {
    captured_at: new Date().toISOString(),
    window: windowLabel,
    count: records.length,
    records,
  }

  const outDir = path.join(process.cwd(), 'ops', 'rejected-articles')
  await mkdir(outDir, { recursive: true })
  const outFile = path.join(outDir, `${windowLabel}.json`)
  await writeFile(outFile, JSON.stringify(output, null, 2), 'utf8')
  console.log(`Wrote ${records.length} records to ${outFile}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
