# Roadmap — Between Milestones (v1 → v1.1)

**Status:** v1 Pilot Release shipped 2026-04-24. v1.1 not yet scoped — run `/gsd:new-milestone` to begin questioning → research → requirements → roadmap.

**Archived:** Full v1 phase history at `.planning/milestones/v1-ROADMAP.md` (35 plans across 6 phases + Phase 5.1 BFF pivot).

## Active Phases

(None — milestone v1 closed; v1.1 not yet scoped.)

## Pre-Pilot Tactical Fixes

Small operator-unblocking changes accumulate in `.planning/quick/` until v1.1 questioning runs and folds them (or supersedes them) into the formal v1.1 roadmap. Each quick task gets atomic commit + STATE.md "Quick Tasks Completed" row.

Drivers for these mid-flight fixes:
- 16 pending operator actions before pilot day 1 (see `.planning/milestones/v1-MILESTONE-AUDIT.md` frontmatter `pending_operator_actions`)
- Environmental constraints discovered during pilot prep (e.g. no AWS CLI access → env-file-on-disk deploy path)
- Small documentation / runbook gaps surfaced as the operator follows `docs/deploy-windows.md`

## Next Action

When pilot prep questions stabilise, run `/gsd:new-milestone` to scope v1.1 from the candidate directions in `.planning/PROJECT.md` (Teams delivery, pilot feedback loop, Phase 6 tech-debt drain, Author-Lint).
