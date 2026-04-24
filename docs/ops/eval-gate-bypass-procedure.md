# Emergency Eval-Gate Bypass Procedure

**Version:** 1.0  
**Owner:** {{STEWARD_NAME}}  
**Applies to:** `deploy.yml` workflow — `skip_eval_gate` input

---

## When to use this procedure

Use ONLY when ALL of the following conditions are met:

1. Production is broken (users cannot use the assistant).
2. The fix has been code-reviewed and the PR has passed `pnpm typecheck` + `pnpm test`.
3. A manual smoke-test of the fix on a staging or local environment is green.
4. The nightly eval gate (`check-evals` job) is red for reasons **unrelated to the fix**
   — for example:
   - Judge-model API outage (LLM_JUDGE_API_KEY provider down)
   - Flaky fixture causing transient failure (not a grounding regression)
   - ServiceNow-downstream flake in a slow suite
   - No nightly run has been scheduled in the last 48h due to runner downtime

**Do NOT use this bypass if:**

- The nightly is red because a grounding threshold was genuinely missed.
- The fix being shipped changes any grounding logic (`src/lib/`, `/api/chat`).
- You are under time pressure but production is not broken.

---

## Procedure

### Step 1 — Open an incident in Teams

Tag the incident in the **#kb-assistant-pilot** Teams channel with a unique **Incident ID**
(e.g. `INC-2026-042`). Include:

- Description of the production issue.
- Why the nightly eval gate is red (unrelated reason).
- Name of the engineer authorising the bypass.

### Step 2 — Trigger the emergency deploy

Run the following command from your local machine (requires `gh` CLI and repo write access):

```bash
gh workflow run deploy.yml -f skip_eval_gate=true --ref main
```

The `check-evals` job will be skipped. The `build` job still runs the **fast-eval hard gate**
(`pnpm eval:fast`) — this cannot be bypassed.

### Step 3 — Verify production health

After the deploy completes, confirm `/api/health` returns `{"status":"ok"}`:

```bash
curl https://<your-host>/api/health
```

### Step 4 — Follow-up obligations (within 24h)

- Investigate why the nightly eval run was red.
- Re-run the nightly manually: `gh workflow run evals-nightly.yml`
- If the nightly is still red after re-run:
  - Open a PR adding quarantine entries (`ops/evals/flaky-review.json`) or fixture fixes.
  - Do **not** trigger another deploy using `skip_eval_gate` without a **new Incident ID**.
- Post a resolution update in **#kb-assistant-pilot** linking the investigation PR or
  confirming the root cause was transient (with evidence).

---

## Audit trail

Every use of this bypass should be traceable via:

- The GitHub Actions run log (filter `evals-nightly.yml` workflow skipped).
- The Teams **#kb-assistant-pilot** Incident ID tag.
- The `gh run list --workflow=deploy.yml` output showing the `skip_eval_gate=true` trigger.

---

## Reviewed

- Content Steward: {{STEWARD_NAME}}
- Engineer on call: see `.planning/STATE.md`
- Plan reference: `.planning/phases/06-telemetry-evals-and-pilot-hardening/06-06-ci-cd-integration-PLAN.md`
