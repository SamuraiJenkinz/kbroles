# KB Assistant Pilot Workbook

## Overview

`kb-assistant-pilot.workbook.json` is an ARM template that deploys a shared Azure Monitor Workbook to your App Insights resource. It contains five sections covering usage, quality signals, content gaps, system health, and eval trend.

## Deterministic workbookId rationale

The `workbookId` parameter defaults to `a1b2c3d4-e5f6-7890-abcd-ef1234567890`. Using a fixed GUID ensures:

- **Idempotence:** Repeated `az deployment group create` runs update the same workbook in place instead of creating duplicates.
- **Stable portal URL:** The workbook URL (`/workbooks/<workbookId>`) remains constant across deploys; bookmarks and Teams channel links never break.
- **Git as source of truth:** If the portal copy diverges from git (someone edits ad-hoc), the next `provision.sh` run overwrites it with the committed version.

Do NOT change the default GUID without also updating any portal bookmarks shared with the team.

## Section overview

| Section | Time window | Primary KQL tables | Purpose |
|---------|-------------|-------------------|---------|
| 1 — Usage | last 7d | `customEvents` | Sessions, users, questions, chip %, role pie |
| 2 — Quality signals | last 24h / 7d | `customEvents` | Thumbs-down %, fallback %, validator-flip %; reasons bar |
| 3 — Content gaps | last 30d | `customEvents` | Top 20 fallback hashes + top 20 thumbs-down hashes |
| 4 — System health | last 1h / 24h | `requests`, `customEvents` | /api/chat count/5xx/p50/p95; ingress_error bar |
| 5 — Eval trend | last 30d | `customEvents` | avg pass_rate by suite, timechart |

### Section 5 WARNING — INERT until follow-up lands

**Section 5 will show "No data" on pilot day 1.** The `eval_run_completed` customEvent is defined in `src/obs/eventSchema.ts` (EVENT_NAMES catalog) but no plan currently emits it to App Insights.

**Follow-up requirement:** Add emission of `eval_run_completed` after each nightly eval run. The simplest path is a new `scripts/emit-eval-events.ts` that reads `ops/evals/latest.json` and POSTs one event per suite to the App Insights ingestion endpoint via the OTel SDK. This script would be invoked as the final step of `.github/workflows/evals-nightly.yml`. Track this as a follow-up task in Phase 6.

The KQL query in Section 5 is complete and correct — it will populate automatically once the emission is in place.

## How to add a new section

1. Open the workbook in the Azure portal.
2. Click **Edit** → open the **Advanced Editor** (the `</>` button).
3. Copy the JSON content of `serializedData`.
4. Paste into a text editor and parse the outer JSON string (the inner content is double-escaped JSON).
5. Add two new items at the end of the `items` array:
   - A `type:1` markdown header item
   - A `type:3` KQL query item (copy an existing one and update `query`, `title`, `name`)
6. Re-stringify the inner JSON, escape it back into the outer JSON string.
7. Paste into the Advanced Editor and click **Apply**.
8. Export the workbook via **Download workbook template** (ARM JSON).
9. Replace the `serializedData` value in `ops/workbooks/kb-assistant-pilot.workbook.json` with the exported value.
10. Run `python -m json.tool < ops/workbooks/kb-assistant-pilot.workbook.json > /dev/null` to confirm valid JSON.
11. Commit and re-run `ops/alerts/provision.sh`.

## Advanced Editor workflow

The portal's Advanced Editor is the easiest way to iterate on KQL before committing:

1. Go to **Azure Monitor → Workbooks → KB Assistant Pilot Dashboard**.
2. Click **Edit** then the **`</>`** button.
3. The displayed JSON is the `serializedData` content (not the full ARM template).
4. Make your changes, click **Apply**, then **Save**.
5. To persist to git: use **Download workbook template** to get the ARM JSON, extract the updated `serializedData`, and paste it back into `kb-assistant-pilot.workbook.json`.

This round-trip ensures git remains the source of truth and ad-hoc portal changes are not silently lost on next deploy.

## Event name contract

All KQL queries in this workbook reference event names from `src/obs/eventSchema.ts` `EVENT_NAMES`. Never use string literals in KQL that are not in that catalog — if a name is misspelled or removed from the schema, the workbook query will silently return zero rows.

Queried events: `role_selected`, `chip_vs_freeform`, `question_hash`, `thumbs_rating`, `fallback_trigger`, `chat_request_completed`, `validator_flip`, `ingress_error`, `eval_run_completed`.

Not queried (present in schema but not needed in current workbook sections): `session_start`, `citation_returned`, `citation_click_through`, `flag_a_gap_action`, `chat_request_started`, `allowlist_block`.
