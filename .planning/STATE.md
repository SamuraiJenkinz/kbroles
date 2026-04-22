# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22)
See: .planning/REQUIREMENTS.md (49 v1 requirements across 12 categories)
See: .planning/ROADMAP.md (6 phases, standard depth)

**Core value:** Every answer is verifiable against the authoritative SOP — users read the cited source section without leaving the conversation. No ungrounded answers, no invented field names or approver names.
**Current focus:** Phase 1 — Grounding Foundation

## Current Position

Phase: 1 of 6 (Grounding Foundation)
Plan: 1 of 5 in current phase
Status: In progress
Last activity: 2026-04-22 — Completed 01-scaffold-registry-schema-PLAN.md

Progress: [██░░░░░░░░] 20%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 7 min
- Total execution time: ~7 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 — Grounding Foundation | 1 / 5 | 7 min | 7 min |

**Recent Trend:**
- 01-scaffold-registry-schema: 7 min, 8 tasks, 6 feat commits + 1 docs metadata commit, 23/23 tests green

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Load-bearing decisions affecting Phase 1:

- Stuff-the-context grounding, no RAG (corpus = 3 docs, fits in 128K)
- gpt-4o (full), not gpt-4o-mini — grounding adherence non-negotiable
- Azure OpenAI via MGTI corporate ingress with `api-key` header
- Dual-mode LLM client (dev=OpenAI Bearer, prod=MGTI api-key) — zero `NODE_ENV` branching
- Structured output JSON Schema strict mode for citations + server-side quote-substring validation

**Plan 01 decisions:**

| Plan | Decision | Rationale |
|------|----------|-----------|
| 01-01 | KB_ID_RE loosened from `\bKB\d{7}\b` to `\bKB\d{5,}\b` | Corpus has both 7-digit (KB0020882, KB0022991) and 8-digit (KB18801781) IDs; RESEARCH.md recommendation was too narrow |
| 01-01 | Custom `rawMarkdown` Vite plugin instead of `assetsInclude` | Vite's `assetsInclude` returns URL references, not raw content; custom transform plugin matches Turbopack `{ type: 'raw' }` behaviour |
| 01-01 | Entity extractor scans source.url attribute too | KB18801781 appears only in the SNOW_FORM permalink, never in section body text |
| 01-01 | Per-task atomic commits (6 feat commits) rather than single combined commit | Follows task_commit_protocol — each task independently revertable |

### Pending Todos

None.

### Blockers/Concerns

**Phase-0 smoke tests (must resolve before Phase 1 closes — addressed in Plan 05):**
- Exact MGTI `baseURL` suffix (5-min curl test)
- MGTI honours `response_format: json_schema` strict mode (unvalidated)
- MGTI streaming chunk cadence through APIM (risk of buffering)
- Entra admin consent for SPA + `brk-multihub://` redirect URI
- Teams sideload policy (MMC may restrict custom-app sideloading)
- Corporate CA chain for outbound HTTPS from App Service to MGTI
- App Service provisioning ownership (who creates the Azure resources)
- Named Content Steward for monthly rejected-article pull from ServiceNow (required before pilot)

## Session Continuity

Last session: 2026-04-22 17:10 UTC
Stopped at: Completed 01-scaffold-registry-schema-PLAN.md
Resume file: None
