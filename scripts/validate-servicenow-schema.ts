/**
 * scripts/validate-servicenow-schema.ts
 *
 * Pre-flight schema validator for the ServiceNow instance.
 * Addresses RESEARCH.md Open Question #1: whether the u_rejection_reason
 * field exists on the live kb_knowledge table.
 *
 * Run ONCE by the operator before the first monthly pull:
 *   pnpm sn:validate
 *
 * Paste the output into docs/content-steward-runbook.md as a reference.
 * This script is NOT part of the automated test suite — it requires live
 * ServiceNow credentials and an active SN_INSTANCE env var.
 */

import { loadSecrets } from '../src/config/secrets.js'

async function main() {
  await loadSecrets()

  const sa = JSON.parse(process.env.SERVICENOW_SERVICE_ACCOUNT ?? '{}') as {
    username?: string
    password?: string
  }
  if (!sa.username || !sa.password) {
    throw new Error(
      'SERVICENOW_SERVICE_ACCOUNT not set or missing username/password. ' +
        'Run `pnpm sn:validate` after setting credentials in .env.local or AWS Secrets Manager.',
    )
  }
  const token = Buffer.from(`${sa.username}:${sa.password}`).toString('base64')
  const instance = process.env.SN_INSTANCE
  if (!instance) {
    throw new Error(
      'SN_INSTANCE not set. Expected value: mmcnow (the ServiceNow subdomain).',
    )
  }

  const schemaUrl = `https://${instance}.service-now.com/api/now/doc/table/schema/kb_knowledge`
  console.log(`Fetching kb_knowledge schema from: ${schemaUrl}`)
  const res = await fetch(schemaUrl, {
    headers: { Authorization: `Basic ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`SN schema fetch ${res.status}: ${await res.text()}`)
  }
  const body = (await res.json()) as {
    result: { elements: Array<{ name: string; label: string }> }
  }
  const fields = body.result.elements.map((e) => e.name)
  console.log('kb_knowledge fields:', fields.length)

  const hasRejectionReason =
    fields.includes('u_rejection_reason') || fields.includes('rejection_reason')
  console.log(
    'u_rejection_reason or rejection_reason present:',
    hasRejectionReason,
  )
  if (!hasRejectionReason) {
    console.warn(
      'WARN: no rejection_reason field found. ' +
        'The pull script will omit rejection_reason from output records.',
    )
  }

  // Print the workflow_state enum choices to confirm retired/outdated/draft values
  const wsUrl = `https://${instance}.service-now.com/api/now/table/sys_choice?sysparm_query=name=kb_knowledge^element=workflow_state`
  console.log(`\nFetching workflow_state enum from: ${wsUrl}`)
  const wsRes = await fetch(wsUrl, {
    headers: { Authorization: `Basic ${token}`, Accept: 'application/json' },
  })
  if (wsRes.ok) {
    const wsBody = (await wsRes.json()) as {
      result: Array<{ value: string; label: string }>
    }
    console.log(
      'workflow_state values:',
      wsBody.result.map((c) => c.value),
    )
    const expectedStates = ['retired', 'outdated', 'draft']
    const missing = expectedStates.filter(
      (s) => !wsBody.result.some((c) => c.value === s),
    )
    if (missing.length > 0) {
      console.warn(
        `WARN: expected workflow_state values not found: ${missing.join(', ')}. ` +
          'Review sysparm_query in pull-servicenow-feedback.ts.',
      )
    } else {
      console.log('All expected states (retired, outdated, draft) confirmed.')
    }
  } else {
    console.warn(`workflow_state enum fetch ${wsRes.status} — skipping`)
  }

  console.log(
    '\nSchema validation complete. Paste this output into docs/content-steward-runbook.md.',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
