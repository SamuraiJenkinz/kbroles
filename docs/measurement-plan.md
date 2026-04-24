# Measurement Plan — KB Assistant Pilot

**Owner:** {{STEWARD_NAME}}
**Pilot window:** {{PILOT_START_DATE}} → {{PILOT_END_DATE}} (TBD; fill in before pilot day 1)
**Signoff date:** {{SIGNOFF_DATE}} (must precede pilot day 1 per Pitfall 14)

> This plan is pre-registered before the pilot starts to prevent post-hoc metric
> selection bias. Do not change primary metrics or success thresholds after
> `{{PILOT_START_DATE}}` without a documented rationale and re-signoff.

---

## Primary metrics (pre-registered)

### 1. Paired-metric flagged-article-rate

Monthly rate of `kb_knowledge` articles transitioning to `retired`, `outdated`,
or `draft` state within the pilot window.

- **Baseline:** `ops/rejected-articles/baseline-pre-pilot.json` — 90-day snapshot
  captured before pilot day 1 via
  `pnpm exec tsx scripts/pull-servicenow-feedback.ts --baseline`
  (or `.github/workflows/steward-monthly.yml` with `baseline: true`).
- **Monthly comparison:** `ops/rejected-articles/YYYY-MM.json` vs baseline rate.
- **Success signal:** A ≥ 10% reduction in flagged-article-rate over the pilot
  period suggests the assistant is helping users find current content. Absent
  effect is **not** a failure by itself — see confounders below. Monotonic
  improvement is not required; direction matters more than magnitude early in
  the pilot.

### 2. Fallback rate

`fallback_pct` from App Insights Workbook Section 2, computed over 7-day windows.

- **Target:** ≤ 25% (questions matched to a KB article vs. all questions).
- **Measurement:** `countif(name == 'fallback_trigger') / countif(name == 'chat_request_completed') * 100`
  over 7d rolling window.
- **Interpretation:** Trending direction is more important than the absolute
  level in the first weeks; start date effects are expected.

### 3. Thumbs-down rate per role

`thumbs_down_pct` from App Insights Workbook Section 2, broken down by
`customDimensions.role`.

- **Target:** ≤ 15% per role.
- **Measurement:** `countif(name == 'thumbs_rating' and customDimensions.rating == 'down') / countif(name == 'chat_request_completed') * 100`
  grouped by role over 7d.
- **Interpretation:** Thumbs-down reason distribution (negative-oos, wrong-citation,
  unhelpful, etc.) guides fix backlog priority.

### 4. Grounding eval pass rates

All 6 eval suites must hold their gate thresholds throughout the pilot window.
A suite falling below threshold triggers the `eval-regression` label in CI and
blocks the next deploy.

| Suite | Threshold | Measured by |
|-------|-----------|-------------|
| `negative-oos` | ≥ 95% pass | `pnpm eval:fast` (PR gate) |
| `paired-role` | ≥ 98% pass | `pnpm eval:slow` (nightly) |
| `citation-substring` | ≥ 99% pass | `pnpm eval:fast` (PR gate) |
| `injection-refuse` | ≥ 95% pass | `pnpm eval:slow` (nightly) |
| `entity-allowlist` | 100% pass | `pnpm eval:fast` (PR gate) |
| `positional` | \|t1−t8\| ≤ 2pp | `pnpm eval:slow` (nightly) |

---

## Secondary metrics

| Metric | Data source | Notes |
|--------|-------------|-------|
| Distinct sessions + users (7d) | App Insights Workbook Section 1 | Usage growth proxy |
| Citation click-through rate by `source_id` | App Insights Workbook Section 2 | Which sources users verify |
| Validator flip rate | App Insights Workbook Section 2 | Target ≤ 5% |
| System health: p50, p95, 5xx rate | App Insights Workbook Section 4 | p50 < 2 s, p95 < 8 s, 5xx < 1% |
| Eval-run trend (pass/fail over time) | App Insights Workbook Section 5 | Stable or improving |

---

## Confounders (pre-registered)

The following factors may influence primary metrics independently of the
assistant's quality. They are documented here to prevent misattribution.

1. **Incidental ServiceNow article cleanup**: Periodic KB hygiene drives by the
   Knowledge Management team can inflate the flagged-article count unrelated to
   the assistant. *Control:* the steward annotates these as "NOISE" in the monthly
   triage issue so they are excluded from the comparison.

2. **Seasonal or holiday dip in KB usage**: End-of-quarter, public holidays, or
   school terms may reduce usage volume. *Control:* compare YoY if a prior year's
   data is available; flag known holiday periods in the monthly triage notes.

3. **Pilot cohort self-selection bias**: Users who opt into the pilot may be more
   tech-savvy or more likely to give feedback. *Control:* record the cohort selection
   method (random draw / department-based / volunteer) in the pilot-start README
   so the bias direction is known.

4. **LLM model updates**: If the underlying model (GPT series) is updated during
   the pilot window, answer quality may shift for reasons unrelated to the app.
   *Control:* log model version in `customDimensions.model_version` via
   `chat_request_completed` event if available; annotate any model upgrade date.

---

## Data sources

| Data | Location | Retention |
|------|----------|-----------|
| App Insights custom events | Azure Application Insights workspace | 90 days default (extend if needed) |
| ServiceNow kb_knowledge + kb_feedback | `ops/rejected-articles/*.json` | Indefinite (git archive) |
| Eval pass-rate history | `ops/evals/history/<timestamp>.json` (10-file rolling) | Commit history |
| Weekly digest snapshots | Teams channel `#kb-assistant-pilot` | Teams retention policy |

---

## Review cadence

| Frequency | Format | Owner |
|-----------|--------|-------|
| Weekly (Mon 09:00 AEST) | Teams digest card from `.github/workflows/weekly-digest.yml` | Steward monitors |
| Monthly (1st business day) | GitHub issue from `.github/workflows/steward-monthly.yml` | Steward triages |
| End-of-pilot | 1-page retro comparing primary metrics to `baseline-pre-pilot.json` | Steward + PM |

---

## Signoff checklist

- [ ] Steward ({{STEWARD_NAME}}) reviewed and committed to the review cadence
- [ ] PM reviewed and agreed on primary + secondary metrics and success thresholds
- [ ] Engineering on-call reviewed alerting configuration (`ops/bicep/alerts.bicep`)
      and rollback procedure (`docs/deploy-windows.md`)
- [ ] `ops/rejected-articles/baseline-pre-pilot.json` has been captured and committed

**Signoff date:** {{SIGNOFF_DATE}}

---

## References

- ROADMAP.md Phase 6 SC#3 (measurement plan pre-signed-off before pilot)
- CONTEXT.md §Steward + rejected-article pull
- CONTEXT.md §Pilot cohort and measurement
- RESEARCH.md §6 (SN REST fields), §8 (Teams webhook)
- `ops/rejected-articles/baseline-pre-pilot.json` (captured pre-pilot)
- `ops/rejected-articles/README.md` (file shape)
- `.github/workflows/steward-monthly.yml` (monthly pull automation)
- `.github/workflows/weekly-digest.yml` (weekly Teams digest)
- `docs/content-steward-runbook.md` (steward procedures)
- `docs/ops/eval-gate-bypass-procedure.md` (emergency eval bypass)
