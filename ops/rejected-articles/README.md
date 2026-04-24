# Rejected Articles Archive

Output from `scripts/pull-servicenow-feedback.ts`. One file per month: YYYY-MM.json.
`baseline-pre-pilot.json` captured once before pilot via `pnpm exec tsx scripts/pull-servicenow-feedback.ts --baseline`
(or via `.github/workflows/steward-monthly.yml` with `baseline: true` input).

## File shape

```json
{
  "captured_at": "2026-05-01T01:02:03.456Z",
  "window": "2026-04",
  "count": 12,
  "records": [
    {
      "sys_id": "abc123",
      "number": "KB0001234",
      "short_description": "How to reset VPN password",
      "workflow_state": "retired",
      "rejection_reason": "Superseded by KB0001235",
      "sys_updated_on": "2026-04-15 08:30:00",
      "feedback_count": 3
    }
  ]
}
```

`rejection_reason` is optional — absent if the SN instance does not have `u_rejection_reason`
on the `kb_knowledge` table (confirmed by `pnpm sn:validate`).

## Steward workflow

1. GitHub Actions opens a monthly issue with a checklist of records.
2. For each record the steward marks it as **Signal**, **Noise**, or **Needs investigation**.
3. Signal items get a PR adding eval fixtures; noise items are annotated and archived.
4. Issue is closed when all items are triaged.

See `docs/content-steward-runbook.md` for the full procedure.
