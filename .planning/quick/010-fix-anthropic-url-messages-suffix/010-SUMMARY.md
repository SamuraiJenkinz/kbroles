---
quick: 010
title: Fix Anthropic adapter URL — append /messages to Create Message path
date: 2026-05-12
commit: TBD
subsystem: llm
tags: [llm, anthropic, mgti, bug-fix, url-construction, smoke-test-validation]

dependency-graph:
  requires: [quick-008, quick-009]
  provides: kbroles `/api/chat` actually routes successfully under LLM_PROVIDER=anthropic
  affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/quick/010-fix-anthropic-url-messages-suffix/010-PLAN.md
    - .planning/quick/010-fix-anthropic-url-messages-suffix/010-SUMMARY.md
  modified:
    - src/llm/anthropicAdapter.ts
    - src/llm/__tests__/anthropicAdapter.test.ts

decisions:
  - id: trust-quickstart-over-spec-readme
    choice: "Adopt the URL path from quickstart.md (with /messages) over the original spec README (without /messages)"
    rationale: "Both docs are in the same git commit (4477a7e, same author, same directory) — neither is older. But the live proxy behaviour is the tie-breaker: POST without /messages returns 404 rf-route-not-found; POST with /messages returns 200 OK. The Quickstart is correct."
    alternatives: []

  - id: keep-text-mode-untouched
    choice: "Do NOT fix the markdown-wrapped JSON issue in text-mode fallback in this task"
    rationale: "The text-mode escape hatch (ANTHROPIC_TOOLS_SUPPORTED=false) is fragile against Claude's natural markdown-formatted output, but tool-use mode (the Quick 009 default) sidesteps this entirely because Bedrock returns parsed input. Scope creep would muddy this fix. If the operator ever needs to flip the escape hatch and hits the markdown problem, that's a separate Quick to add markdown-fence stripping."
    alternatives: []

metrics:
  duration: "~15 minutes (incl. doc writeup)"
  completed: 2026-05-12
  files_changed: 2
  test_count_before: 773
  test_count_after: 773
  new_dependencies: 0
---

# Quick Task 010: Fix Anthropic adapter URL — append /messages

**One-liner:** the MGTI Anthropic proxy's Create Message endpoint lives at `POST .../model/{name}/messages`, not `POST .../model/{name}` as the original spec PDF showed. The Quick 008/009 adapter built the wrong URL. Live smoke test caught it before any prod deploy. One-line code fix.

## Commit

| Field | Value |
|---|---|
| Hash | TBD |
| Subject | `fix(anthropic): append /messages to Create Message URL path` |
| Branch | `master` |
| Co-Author | `Claude Opus 4.7 (1M context) <noreply@anthropic.com>` |

## The bug

`src/llm/anthropicAdapter.ts` built the URL as:

```typescript
const url = `${e.ANTHROPIC_BASE_URL!.replace(/\/$/, '')}/model/${encodeURIComponent(e.ANTHROPIC_MODEL!)}`
```

The original MGTI spec PDF (BrunoTropic.pdf, page 6) documented the Create Message endpoint as:

```
POST /coreapi/llm/anthropic/v1/model/{modelName}
```

Quick 008 + 009 were both implemented and tested against this path. All 42 tests across env + adapter passed because the URL assertion was hardcoded to the spec's documented path.

**But the live proxy returns 404 `rf-route-not-found` for that path.** The correct path is documented in the MGTI Quickstart (same git commit `4477a7e` in `mmctech/coreapi-apigee` → `proxies/llm-anthropic/quickstart.md`, page 4):

```
POST /coreapi/llm/anthropic/v1/model/{modelName}/messages
                                              ^^^^^^^^^
```

The `/messages` suffix is mandatory.

## How it was caught

Live curl smoke test against the non-prod NASA proxy on 2026-05-12 (operator: taylorkevo@gmail.com), Phase A of the operator switch-on procedure in 008-SUMMARY.md:

| Request | Result | Diagnosis |
|---|---|---|
| `GET .../v1/spend` with `x-api-key` | 200 OK + valid spend JSON | Proves API key valid + proxy reachable + app provisioned for `coreapi-llm-anthropic` proxy |
| `POST .../v1/model/eu.anthropic.claude-sonnet-4-5-20250929-v1:0` (no /messages) | 404 `rf-route-not-found` | Route pattern doesn't match Apigee config |
| `POST .../v1/model/eu.anthropic.claude-sonnet-4-5-20250929-v1%3A0` (URL-encoded `:`) | 404 same | Not a URL-encoding issue |
| `POST .../v1/model/eu.anthropic.claude-sonnet-4-6` (no colon) | 404 same | Not a model-name issue |
| `POST .../v1/model/eu.anthropic.claude-sonnet-4-6/messages` | **200 OK + valid Claude response** | Correct path |

The `/spend` working while `/model/{name}` 404s pointed at "the route pattern is wrong" rather than "the auth or app provisioning is wrong." Reading the Quickstart side-by-side with the spec revealed the path difference.

## The fix

`src/llm/anthropicAdapter.ts`:

```diff
- const url = `${e.ANTHROPIC_BASE_URL!.replace(/\/$/, '')}/model/${encodeURIComponent(e.ANTHROPIC_MODEL!)}`
+ const url = `${e.ANTHROPIC_BASE_URL!.replace(/\/$/, '')}/model/${encodeURIComponent(e.ANTHROPIC_MODEL!)}/messages`
```

`src/llm/__tests__/anthropicAdapter.test.ts`:

```diff
- 'https://stage.int.nasa.apis.mmc.com/coreapi/llm/anthropic/v1/model/eu.anthropic.claude-sonnet-4-5-20250929-v1%3A0'
+ 'https://stage.int.nasa.apis.mmc.com/coreapi/llm/anthropic/v1/model/eu.anthropic.claude-sonnet-4-5-20250929-v1%3A0/messages'
```

Plus an inline comment in anthropicAdapter.ts documenting the spec discrepancy and the smoke test that confirmed the correct path, so the next maintainer doesn't repeat this.

## Confirmed invariants

- `git diff HEAD~1 HEAD -- src/llm/anthropicAdapter.ts` is the URL line + comment only.
- `git diff HEAD~1 HEAD -- src/llm/__tests__/anthropicAdapter.test.ts` is the URL string only.
- No other source files changed.
- No new dependencies.
- `pnpm typecheck` clean.
- `pnpm test` — 773/773 (unchanged from Quick 009).

## Test counts

| Scope | Before | After | Delta |
|---|---|---|---|
| `src/llm/__tests__/anthropicAdapter.test.ts` | 25 | 25 | 0 (URL assertion changed value only) |
| Whole suite | 773 | 773 | 0 |

## Side observations from the smoke test (not addressed here)

1. **Bedrock prompt caching headers exist but cache use is 0** on this initial test. The response headers include `x-amzn-bedrock-cache-write-input-token-count: 0` and `cache_read_input_tokens: 0` — Bedrock exposes the prompt-caching telemetry, suggesting the proxy passes through `cache_control` annotations. With our system prompt at ~5K tokens stable across requests, this is a meaningful cost-win lever. Candidate Quick 013.

2. **Claude in text-mode wraps JSON in markdown code fences** (` ```json...``` `). The adapter's text-mode fallback (ANTHROPIC_TOOLS_SUPPORTED=false) would fail JSON.parse on this output. Not a blocker — Quick 009's tool-use mode default sidesteps it because Bedrock returns the parsed `input` object directly. If the operator ever needs the escape hatch and hits this, a separate Quick can add markdown-fence stripping before parse.

3. **Bedrock guardrail confirmed in `eu-west-1`** with no action triggered on a benign test prompt. Guardrail telemetry is rich (per-policy unit counts, latency) and could be surfaced in logs if useful for diagnosing false-positives later.

## Push status

To be pushed by orchestrator after this commit lands.

## Follow-up

- Quick 011 candidate (renumbered from prior STATE narrative) — allowlist over-strictness
- Quick 012 candidate — stochastic regression eval
- Quick 013 candidate — Bedrock prompt caching via `cache_control` annotations (now corroborated by live response headers showing the capability)
- Quick 014 candidate — GHA deploy.yml audit
- Quick 015 candidate — text-mode markdown-fence stripping (only if the escape hatch is ever used)

The Critical Gap from Quick 008 stays closed (tool-use is the default). The Quick 010 fix is the last step needed before the operator can run Phase B with confidence.

## Operator next step

After this commit pushes:

```powershell
cd D:\kbroles
git pull
# .env.production already has ANTHROPIC_API_KEY (from Quick 008 setup, if done) — no env change needed
pnpm build
schtasks /end /tn KbAssistant
# Optionally update .env.production to set LLM_PROVIDER=anthropic + ANTHROPIC_BASE_URL + ANTHROPIC_MODEL
schtasks /run /tn KbAssistant
```

Then the kbroles `/api/chat` route should reach Claude Sonnet 4.6 via the MGTI proxy successfully on the first request, with tool-use mode enforcing CITATION_SCHEMA at the API level.
