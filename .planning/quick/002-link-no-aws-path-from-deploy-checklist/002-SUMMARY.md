---
phase: quick-002
plan: 01
status: complete
completed: 2026-04-29
commit: b6faef1
---

# Quick Task 002: Surface no-AWS env-file path as HB-6 alternative

## Task completed

Single docs-only edit to `DEPLOY-CHECKLIST.md` so operators reading the checklist top-to-bottom discover the no-AWS deploy path (landed in `docs/deploy-windows.md` §4.2 (alternative) by quick task 001) before reaching HB-6, and find HB-6/HB-7/HB-9 restructured to present AWS-vs-no-AWS as a binary choice rather than a hard AWS-only gate.

## Commit

`b6faef1` — `docs(deploy-checklist): surface no-AWS env-file path as HB-6 alternative`

## Files touched

| File | Change |
|------|--------|
| `DEPLOY-CHECKLIST.md` | +20 lines / -7 lines (27 lines total delta) |

No other files modified. `git diff --stat HEAD~1 HEAD` confirms exactly one file changed.

## Changes made (four surgical edits)

1. **Background reading list** — expanded the `docs/deploy-windows.md` bullet to annotate it as the "default: AWS Secrets Manager path" and added a sub-bullet naming `§4.2 (alternative)` + supporting files (`.env.production.example`, `scripts/start.ps1`) with a "use this if no AWS CLI access" note.

2. **HB-6** — section heading renamed from "AWS Secrets Manager" to "Secrets store"; item title changed to "Secrets store provisioned (EITHER AWS Secrets Manager OR env-file-on-disk)"; body restructured into a "Recommended path" (existing 7-key AWS list, preserved) + "OR (alternative for no-AWS pilots)" sub-section (env-file steps, ACL, launcher, loadSecrets() activation); Done-when updated to accept either path.

3. **HB-7** — title marked `*(optional — skip if using HB-6 env-file alternative)*`; blockquote skip note added before the How line. Existing How/Done-when preserved for the AWS path.

4. **HB-9** — Done-when rewritten to "EITHER AWS Secrets Manager OR `D:\kbroles\.env.production`" with explicit note that `NODE_EXTRA_CA_CERTS` stays machine-scope on both paths.

HB-5 (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) was NOT modified — GHA secrets remain required for the steward workflow reaching AWS from CI regardless of which deploy path the Windows box uses.

## Verification grep output

```
# §4.2 (alternative) — count (expect ≥2)
3 matches
  line 8:  background reading sub-bullet
  line 90: HB-6 OR alternative sub-section How
  line 96: HB-6 Done-when EITHER branch

# scripts/start.ps1 — count (expect ≥1)
3 matches
  line 8:  background reading sub-bullet
  line 93: HB-6 OR alternative sub-section launcher step
  line 101: HB-7 skip note

# .env.production.example — count (expect ≥1)
2 matches
  line 8:  background reading sub-bullet
  line 91: HB-6 OR alternative sub-section copy step

# AWS_ACCESS_KEY_ID — count (expect 1, unchanged)
1 match
  line 65: HB-5 body (unchanged)
```

All phase-level checks passed: ≥2 for §4.2 (alternative), ≥1 for scripts/start.ps1, ≥1 for .env.production.example, =1 for AWS_ACCESS_KEY_ID.

## Constraints honoured

- HB-5 byte-identical to pre-edit state.
- AWS Secrets Manager remains the default/recommended voice throughout.
- env-file path is consistently labelled "alternative" / "OR".
- Cross-links use repo-relative `docs/deploy-windows.md §X` style matching existing checklist style.
- Single atomic commit; no other files staged.
- ROADMAP.md not touched.
- STATE.md not touched (orchestrator handles closure).
