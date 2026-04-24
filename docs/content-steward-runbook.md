# Content Steward Runbook

**Steward:** {{STEWARD_NAME}}
**Backup:** {{STEWARD_BACKUP_NAME}}
**Signoff date:** {{SIGNOFF_DATE}} (must precede pilot day 1)

---

## Ownership

One named individual is accountable for the monthly rejected-article review and
eval-fixture backlog. Vacation coverage is the backup steward above. The PM is
notified if both are unavailable.

This runbook is a living document. File a PR to update it as the pilot evolves.

---

## Cadence

| Frequency | Trigger | Deliverable |
|-----------|---------|-------------|
| **Monthly** | 1st business day of each month | Triage the auto-opened GitHub issue |
| **Weekly** | Monday 09:00 AEST (automated) | Glance at the Teams digest for anomalies (no deliverable unless action needed) |
| **Ad-hoc** | Eval-regression issues opened by nightly CI | Investigate + fix within 48 h |

---

## Monthly pull procedure

1. On the 1st of each month GitHub Actions runs
   `.github/workflows/steward-monthly.yml` at 01:00 UTC (AEST 11:00).
   - If the 1st is a Saturday or Sunday the workflow skips the scheduled run
     and logs a notice. The steward triggers it manually via
     **Actions → Content Steward Monthly Pull → Run workflow** on the next
     business day.
   - To capture the pre-pilot baseline, trigger it once with **baseline: true**
     before the pilot starts. Output: `ops/rejected-articles/baseline-pre-pilot.json`.

2. The workflow:
   a. Fetches `kb_knowledge` records in `retired`, `outdated`, or `draft` state
      updated during the current month.
   b. Correlates each article with its `kb_feedback` rows to compute
      `feedback_count`.
   c. Writes `ops/rejected-articles/YYYY-MM.json` (see `ops/rejected-articles/README.md`
      for the file shape).
   d. Opens a GitHub issue titled
      **"Content Steward review: YYYY-MM rejected articles (N items)"**
      labelled `content-steward` and (if `STEWARD_GH_HANDLE` repo variable is set)
      auto-assigned to the steward.
   e. Commits the JSON archive back to the `main` branch.

3. The steward reviews each item in the issue checklist and makes one of three
   decisions:

   - **Signal**: The article's retirement reveals a gap in eval coverage.
     → Open a PR adding entries to `src/evals/fixtures/real-query-coverage.json`
       or `src/evals/fixtures/negative-oos.json` per the PR template below.
   - **Noise**: The article was retired for procedural reasons (e.g. version
     consolidation, already re-published under a new KB number, duplicate).
     → Mark the checkbox `- [x] KB0001234 — NOISE: <reason>`.
   - **Needs investigation**: Insufficient context to decide.
     → Open a Teams thread in `#kb-assistant-pilot` and link it in the checkbox.

4. Close the issue when **all** items are triaged. The JSON archive is preserved
   in `ops/rejected-articles/` for longitudinal comparison.

---

## Schema validation (one-time pre-flight)

Before the first monthly pull, the operator must run:

```bash
pnpm sn:validate
```

This calls `scripts/validate-servicenow-schema.ts`, which:
- Confirms `u_rejection_reason` (or `rejection_reason`) is present on
  `kb_knowledge`.
- Prints the `workflow_state` enum values so the `sysparm_query` filter in the
  pull script can be verified.

Paste the output here as a reference:

```
# PASTE pnpm sn:validate OUTPUT BELOW
# kb_knowledge fields: <N>
# u_rejection_reason or rejection_reason present: true/false
# workflow_state values: ['retired', 'outdated', 'draft', ...]
```

---

## PR template for new eval fixtures

Use this template when opening a PR for Signal items:

```markdown
## What
Add {N} eval fixtures derived from YYYY-MM rejected-article review.

## Why
Article(s) {KB numbers} surfaced gaps in eval suite(s) {suite names}.

## Eval impact
- `src/evals/fixtures/negative-oos.json`: +{N} fixtures
- `src/evals/fixtures/real-query-coverage.json`: +{N} fixtures
- `src/evals/fixtures/paired-role-*.json` (if applicable): +{N} fixtures

## Verification
- [ ] `pnpm eval:fast` passes locally
- [ ] `pnpm eval:slow` exits 0 with no new failures (or failures investigated)
- [ ] Nightly eval CI is expected to pick up the new fixtures on the next run

## Related
Closes content-steward issue #<number>
```

---

## Escalation

| Situation | Action |
|-----------|--------|
| Two consecutive nightly eval reds | Investigate before next deploy. See `docs/ops/eval-gate-bypass-procedure.md` for the emergency bypass procedure (requires Incident ID). |
| ServiceNow pull failure | Manually run `pnpm exec tsx scripts/pull-servicenow-feedback.ts` after verifying credentials. File an infra issue if the SN instance is unavailable. |
| Steward **and** backup both unavailable | PM designates a third delegate. Allowed at most once per quarter; document the delegate in the issue. |
| `content-steward` label missing in repo | Create it: **Issues → Labels → New label**, color `#0075ca`. |
| `STEWARD_GH_HANDLE` repo var not set | Issues are created without auto-assign. Set it at **Settings → Secrets and variables → Actions → Variables**. |

---

## Signoff checklist

- [ ] Steward ({{STEWARD_NAME}}) has reviewed this runbook
- [ ] Backup steward ({{STEWARD_BACKUP_NAME}}) has reviewed this runbook
- [ ] PM has reviewed `docs/measurement-plan.md` and agreed on metrics
- [ ] `pnpm sn:validate` run and output pasted into the "Schema validation" section above
- [ ] Pre-pilot baseline captured: `ops/rejected-articles/baseline-pre-pilot.json` exists

**Signoff date:** {{SIGNOFF_DATE}}

---

## References

- `scripts/pull-servicenow-feedback.ts` — the pull script
- `scripts/validate-servicenow-schema.ts` — schema dry-run
- `.github/workflows/steward-monthly.yml` — monthly automation
- `.github/workflows/weekly-digest.yml` — weekly Teams digest
- `ops/rejected-articles/` — JSON archive directory
- `docs/measurement-plan.md` — primary + secondary metrics
- `docs/ops/eval-gate-bypass-procedure.md` — emergency bypass procedure
- ROADMAP.md Phase 6 TELE-04
- CONTEXT.md §Steward + rejected-article pull
- RESEARCH.md §5b (monthly workflow), §6 (SN REST fields)
