---
phase: quick-002
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - DEPLOY-CHECKLIST.md
autonomous: true

must_haves:
  truths:
    - "An operator reading DEPLOY-CHECKLIST.md top-to-bottom learns that a no-AWS deploy path exists before they hit HB-6."
    - "HB-6 no longer reads as a hard requirement to provision AWS Secrets Manager — it presents AWS-or-env-file as a binary choice."
    - "HB-7 is explicitly marked optional for operators on the no-AWS path."
    - "HB-9 (MGTI / LLM) Done-when accepts either AWS Secrets Manager OR .env.production as the secret store, while NODE_EXTRA_CA_CERTS stays machine-scope."
    - "HB-5 is unchanged — AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY remain required for the steward script reaching AWS from CI."
    - "The default narrative still presents AWS Secrets Manager as the recommended path; the env-file path is labelled as an alternative."
  artifacts:
    - path: "DEPLOY-CHECKLIST.md"
      provides: "v1 pilot rollout checklist with both AWS and no-AWS deploy paths surfaced"
      contains: "Step 4.2 (alternative)"
  key_links:
    - from: "DEPLOY-CHECKLIST.md (top — Background reading / How to use section)"
      to: "docs/deploy-windows.md §4.2 (alternative)"
      via: "bullet in referenced docs list naming the no-AWS path + supporting files"
      pattern: "Step 4.2 \\(alternative\\)"
    - from: "DEPLOY-CHECKLIST.md HB-6 body"
      to: "docs/deploy-windows.md §4.2 (alternative) + scripts/start.ps1 + .env.production.example"
      via: "EITHER/OR restructured How and Done-when criteria"
      pattern: "scripts/start\\.ps1|\\.env\\.production\\.example"
    - from: "DEPLOY-CHECKLIST.md HB-7 body"
      to: "HB-6 alternative branch"
      via: "explicit optional-when-on-no-AWS-path note"
      pattern: "optional|skipped"
    - from: "DEPLOY-CHECKLIST.md HB-9 Done-when"
      to: ".env.production as alternate secret-recording location"
      via: "parallel branch in Done-when criterion"
      pattern: "\\.env\\.production"
---

<objective>
Update DEPLOY-CHECKLIST.md so v1 pilot operators following the checklist top-to-bottom can discover and follow the no-AWS env-file-on-disk deploy path that quick task 001 just landed in `docs/deploy-windows.md` Step 4.2 (alternative). Currently HB-6 and HB-7 are written as hard AWS-Secrets-Manager-only blockers, which gates pilots without AWS CLI access from progressing.

Purpose: Make the AWS-vs-no-AWS choice explicit in the checklist that operators actually drive off, without weakening the default AWS happy-path narrative.
Output: Edited DEPLOY-CHECKLIST.md (single docs commit, ~15-30 lines touched).
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@DEPLOY-CHECKLIST.md
@docs/deploy-windows.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Surface no-AWS env-file path as HB-6 alternative across DEPLOY-CHECKLIST.md</name>
  <files>DEPLOY-CHECKLIST.md</files>
  <action>
Make five surgical edits to DEPLOY-CHECKLIST.md. Keep the existing AWS path as the default narrative throughout — every change is additive, surfacing the alternative without burying the default. Match existing checklist style for cross-links (`docs/deploy-windows.md §X`, not absolute paths). Do NOT touch HB-5 — AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY remain required because the monthly steward script reaches AWS Secrets Manager from CI regardless of which deploy path the Windows box uses.

**Edit 1 — Background reading list (around line 7-9, "Background reading before starting"):**

Add one bullet that names the no-AWS alternative path and its supporting files. Insert AFTER the existing `docs/deploy-windows.md` bullet so it sits as a sub-pointer to the same runbook. Suggested wording:

```
- [`docs/deploy-windows.md`](docs/deploy-windows.md) §4.2 (alternative) — no-AWS env-file-on-disk path; supporting files: `.env.production.example`, `scripts/start.ps1` (use this if the pilot box has no AWS CLI access)
```

**Edit 2 — HB-6 (currently lines 74-85, "AWS Secrets Manager secret `/mmc/cts/kb-assistant` provisioned..."):**

Restructure as a binary choice. The item title should become something like:

```
**HB-6** Secrets store provisioned (EITHER AWS Secrets Manager OR env-file-on-disk)
```

Body keeps the existing 7-key list as the AWS recommended path (preserve all 7 key names: `ENTRA_CLIENT_SECRET`, `SESSION_SECRET`, `QUESTION_HASH_SALT`, `APPLICATIONINSIGHTS_CONNECTION_STRING`, `TEAMS_WEBHOOK_URL`, `SERVICENOW_SERVICE_ACCOUNT`, `SN_INSTANCE`). Add an "OR (alternative for no-AWS pilots)" sub-section that points to:

- `docs/deploy-windows.md` §4.2 (alternative)
- `.env.production.example` (template) at repo root
- `scripts/start.ps1` (launcher that reads the env file)
- File location: `D:\kbroles\.env.production`, ACL'd to the service account

Done-when criterion gets a parallel second branch:

```
**Done when:** EITHER `aws secretsmanager get-secret-value --secret-id /mmc/cts/kb-assistant --region us-east-1` returns a JSON blob with all 7 keys, OR `D:\kbroles\.env.production` exists on the Windows box with all 11 keys populated and ACL'd to the service account per `docs/deploy-windows.md` §4.2 (alternative).
```

(11 keys reflects the full env-file footprint per `.env.production.example` — broader than the 7 keys AWS Secrets Manager holds because the env file also covers values otherwise sourced from machine-scope env vars.)

**Edit 3 — HB-7 (currently lines 87-91, "Windows Server IAM credentials configured"):**

Mark the item title as optional for the no-AWS path. Suggested edit to the title line:

```
**HB-7** *(optional — skip if using HB-6 env-file alternative)* Windows Server IAM credentials configured (AWS SDK credential chain finds them)
```

Add a one-line note in the body BEFORE the existing `**How:**` line:

```
> If using the env-file-on-disk path (HB-6 alternative), this item can be skipped. The Scheduled Task launches via `scripts/start.ps1` which doesn't reach AWS at runtime.
```

Leave the existing How/Done-when intact — they remain correct for the AWS path.

**Edit 4 — HB-9 MGTI / LLM Done-when (currently line 111):**

The current Done-when reads: `Values recorded in AWS Secrets Manager (\`LLM_API_KEY\`, \`LLM_BASE_URL\`, \`LLM_MODEL\`) and the CA bundle file is on the Windows box with \`NODE_EXTRA_CA_CERTS\` set as machine-scope env var...`

Add a parallel branch for the env-file path. Suggested rewrite:

```
**Done when:** Values recorded in EITHER AWS Secrets Manager OR `D:\kbroles\.env.production` (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`) AND the CA bundle file is on the Windows box with `NODE_EXTRA_CA_CERTS` set as machine-scope env var (the Scheduled Task reads it at start — NOT from .env, regardless of which secrets path you chose, see `docs/env-handling.md` §3).
```

The NODE_EXTRA_CA_CERTS machine-scope guidance MUST stay unchanged — it remains machine-scope on both paths because Node reads it before any dotenv-style loader runs.

**Edit 5 — HB-5 (currently lines 61-70):**

DO NOT modify HB-5. The AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY GitHub Actions secrets remain required even on the no-AWS deploy path because the monthly steward script (a separate GHA workflow) reaches AWS Secrets Manager from CI to refresh values — that's independent of how the Windows box loads its own runtime config. Pass through this section without edits. (This bullet is in the plan only to make the no-edit explicit for the executor.)

After making edits 1-4, do a final read of the modified sections to confirm:
- The AWS happy path is still the default voice in HB-6 and HB-9 (env-file appears as "OR alternative", not as primary).
- HB-5 is byte-identical to its pre-edit state.
- All cross-links use repo-relative paths matching existing style.
  </action>
  <verify>
Run grep checks against the modified file:

```bash
# HB-6 must reference both paths
grep -n "AWS Secrets Manager" DEPLOY-CHECKLIST.md
grep -n "Step 4.2 (alternative)\|§4.2 (alternative)" DEPLOY-CHECKLIST.md
grep -n "scripts/start.ps1" DEPLOY-CHECKLIST.md
grep -n ".env.production.example" DEPLOY-CHECKLIST.md

# HB-7 must show optional marker
grep -n "HB-7" DEPLOY-CHECKLIST.md
grep -in "optional\|skip" DEPLOY-CHECKLIST.md | grep -i "HB-7\|env-file\|alternative"

# HB-9 must accept env-file as alternate secret store
grep -n "EITHER AWS Secrets Manager OR\|D:\\\\kbroles\\\\.env.production" DEPLOY-CHECKLIST.md

# HB-5 must be unchanged: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY still listed as required
grep -n "AWS_ACCESS_KEY_ID" DEPLOY-CHECKLIST.md
```

Expected:
- "AWS Secrets Manager" appears in HB-6 body (and elsewhere as before).
- "§4.2 (alternative)" or "Step 4.2 (alternative)" appears at least twice (background-reading + HB-6 + likely HB-9).
- `scripts/start.ps1` and `.env.production.example` each appear at least once.
- HB-7 line includes "optional" and a reference to skipping when on the env-file path.
- HB-9 Done-when contains "EITHER" + ".env.production".
- HB-5's `AWS_ACCESS_KEY_ID` line is intact and unchanged.

Also do a manual diff scan: `git diff DEPLOY-CHECKLIST.md` should show changes ONLY in the background-reading bullet area, HB-6, HB-7, and HB-9. No changes in HB-1 through HB-5 or HB-8.
  </verify>
  <done>
- DEPLOY-CHECKLIST.md edited with all 4 surgical changes (background-reading + HB-6 + HB-7 + HB-9); HB-5 untouched.
- All grep checks above return matches as expected.
- AWS Secrets Manager remains the default/recommended voice; env-file is consistently labelled "alternative" / "OR".
- Cross-links use repo-relative `docs/deploy-windows.md §X` style.
- `git diff --stat` shows exactly one file changed: `DEPLOY-CHECKLIST.md`.
- Single commit created with subject: `docs(deploy-checklist): surface no-AWS env-file path as HB-6 alternative`.
  </done>
</task>

</tasks>

<verification>
Phase-level checks (run after task completes):

1. `git status` shows DEPLOY-CHECKLIST.md modified, nothing else.
2. `git diff --stat HEAD` shows ~15-30 lines changed in DEPLOY-CHECKLIST.md.
3. Final grep sweep:
   ```bash
   grep -c "Step 4.2 (alternative)\|§4.2 (alternative)" DEPLOY-CHECKLIST.md  # expect ≥2
   grep -c "scripts/start.ps1" DEPLOY-CHECKLIST.md                            # expect ≥1
   grep -c ".env.production.example" DEPLOY-CHECKLIST.md                      # expect ≥1
   grep -c "AWS_ACCESS_KEY_ID" DEPLOY-CHECKLIST.md                            # expect 1 (unchanged)
   ```
4. Read-through: an operator reading top-to-bottom encounters the no-AWS option in the background-reading section before reaching HB-6, and HB-6/HB-7/HB-9 each acknowledge both paths.
</verification>

<success_criteria>
- DEPLOY-CHECKLIST.md presents the AWS-vs-no-AWS deploy paths as a binary choice in HB-6, with HB-7 marked optional on the no-AWS path and HB-9 accepting either secret store.
- AWS Secrets Manager remains the default/recommended path; env-file is the alternative.
- HB-5 is unchanged (steward script still requires AWS GHA secrets).
- Cross-links match existing checklist style.
- Single commit with the suggested subject lands the change.
</success_criteria>

<output>
After completion, no SUMMARY file is required for quick-mode tasks. The git commit itself is the artifact.
</output>
