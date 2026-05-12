---
quick: 009
title: Enable Anthropic strict-tools mode (closes Quick 008 critical gap)
date: 2026-05-12
commit: TBD
subsystem: llm
tags: [llm, anthropic, claude, mgti, bedrock, structured-output, tool-use, citation-contract]

dependency-graph:
  requires: [quick-008]
  provides: API-level CITATION_SCHEMA enforcement on the Anthropic path via Bedrock tool-use mode
  affects: []

tech-stack:
  added: []
  patterns:
    - "reuse existing CITATION_SCHEMA as a tool input_schema — single source of truth across OpenAI strict mode, Anthropic tool mode, and the post-response Ajv validator"
    - "operator-flippable escape hatch (ANTHROPIC_TOOLS_SUPPORTED=false) preserves a working code path if the upstream proxy regresses"
    - "disable_parallel_tool_use: true to align tool-use behaviour with GRND-04 (≤1 citation per response)"

key-files:
  created:
    - .planning/quick/009-anthropic-strict-tools-mode/009-PLAN.md
    - .planning/quick/009-anthropic-strict-tools-mode/009-SUMMARY.md
  modified:
    - src/config/env.ts
    - src/config/__tests__/env.test.ts
    - src/llm/anthropicAdapter.ts
    - src/llm/__tests__/anthropicAdapter.test.ts

decisions:
  - id: tool-use-as-default-with-escape-hatch
    choice: "Make tool-use the default mode (ANTHROPIC_TOOLS_SUPPORTED defaults to 'true'); preserve text/JSON mode behind the flag"
    rationale: "MGTI confirmed tools pass through. Tool-use is the Anthropic-native equivalent of OpenAI's strict-schema mode and gives kbroles the same defense-in-depth on both providers. The text/JSON path stays as a flag-gated escape hatch so a future proxy regression is a one-line .env change, not a code revert."
    alternatives: ["text mode as default with tools opt-in — rejected; defaults should match the better path, not the safer one, when both are equally tested"]

  - id: reuse-citation-schema-as-input-schema
    choice: "Pass CITATION_SCHEMA directly as the tool's input_schema"
    rationale: "Single source of truth across three places: (1) OpenAI strict-mode response_format, (2) Anthropic tool input_schema, (3) post-response Ajv validator. Any future schema change propagates everywhere automatically without coordination overhead."
    alternatives: ["a separate AnthropicToolSchema — rejected; introduces a drift surface for no benefit"]

  - id: disable-parallel-tool-use
    choice: "tool_choice includes disable_parallel_tool_use: true"
    rationale: "GRND-04 mandates ≤1 citation per response. The validator enforces this server-side, but having the model produce a single tool call from the outset eliminates an unnecessary failure mode (model emits 2 calls → validator trims the second to flip → trimmed_excess_citation entries in flip log). Cleaner happy path."
    alternatives: ["leave parallel tool use enabled and rely on the validator's trim logic — rejected; correct-by-construction is better than correct-by-recovery"]

  - id: stop-reason-tool-use-as-success
    choice: "Treat stop_reason='tool_use' identically to 'end_turn' on the happy path"
    rationale: "Anthropic Bedrock sets stop_reason='tool_use' when a forced tool call completes successfully. The existing guardrail check (`stop_reason === 'guardrail_intervened'`) is the only failure discriminator on stop_reason; everything else is success. No additional handling needed."
    alternatives: []

  - id: extract-helper-rather-than-mode-branching-inline
    choice: "extractKbResponse() helper centralises mode-aware response extraction"
    rationale: "attemptRequest() is the orchestration site (HTTP + error mapping + guardrail check); extraction logic varies by mode but the orchestration is identical. Pulling extraction into a helper keeps attemptRequest readable and gives the test suite a clean seam."
    alternatives: ["inline branching in attemptRequest — rejected; muddies the function, harder to test in isolation"]

metrics:
  duration: "~50 minutes (estimate was ~1 hour)"
  completed: 2026-05-12
  files_changed: 4
  new_tests: 11
  test_count_before: 762
  test_count_after: 773
  new_dependencies: 0
---

# Quick Task 009: Enable Anthropic strict-tools mode

**One-liner:** the Anthropic adapter now uses tool-use as its primary path, restoring API-level CITATION_SCHEMA enforcement (via Bedrock) on the Anthropic provider — the strict-schema backstop that Quick 008 had to ship without because the MGTI proxy spec didn't document `tools` support. Operator confirmed support; we shipped the change.

## Commit

| Field | Value |
|---|---|
| Hash | TBD |
| Subject | `feat(llm): enable Anthropic strict-tools mode (closes Quick 008 critical gap)` |
| Branch | `master` |
| Co-Author | `Claude Opus 4.7 (1M context) <noreply@anthropic.com>` |

## What ships

### `src/config/env.ts`

Added `ANTHROPIC_TOOLS_SUPPORTED: z.enum(['true', 'false']).optional().default('true')`. Mirrors the existing `STRICT_SCHEMA_SUPPORTED` flag pattern — same Zod-validated string contract, same escape-hatch rationale, same JSDoc voice. Default `'true'` activates the strict-tools path; operator flips to `'false'` if the proxy ever regresses.

### `src/llm/anthropicAdapter.ts`

Three coordinated changes:

1. **Body construction (`buildRequestBody`)** — when `ANTHROPIC_TOOLS_SUPPORTED !== 'false'`, the body now includes:
   ```jsonc
   {
     "tools": [{
       "name": "emit_kb_response",
       "description": "Emit the grounded knowledge-base response...",
       "input_schema": <CITATION_SCHEMA — imported, not duplicated>
     }],
     "tool_choice": {
       "type": "tool",
       "name": "emit_kb_response",
       "disable_parallel_tool_use": true
     }
   }
   ```
   Plus all the previously-shipped fields (`anthropic_version`, `system`, `messages`, `max_tokens`, `temperature`, `stream: false`).

2. **Response extraction (`extractKbResponse`)** — new helper that branches on the same env flag:
   - **Tool-use mode:** finds the `content[?]` block with `type === 'tool_use'`, validates `name === 'emit_kb_response'`, returns its `input` field directly. No `JSON.parse` — Bedrock already returned a parsed object.
   - **Text mode (fallback):** concatenates `content[?].text` blocks, `JSON.parse`s the result. Identical to the Quick 008 shipped behaviour.
   - Throws on structural mismatches (no tool_use block, wrong tool name, empty input) so the existing `streamAnswerAnthropic` retry path gets one more attempt.

3. **`attemptRequest` orchestration** — replaces the inline `extractText` + `JSON.parse` with a single `extractKbResponse(data)` call. Guardrail check (`stop_reason === 'guardrail_intervened' → RefusalError`) is unchanged and still runs before extraction. Ajv post-validation kept as belt-and-suspenders for both modes (Bedrock's enforcement is the primary guarantee; Ajv catches any escapes).

### `src/llm/__tests__/anthropicAdapter.test.ts` and `src/config/__tests__/env.test.ts`

25 adapter tests now (was 17); 44 env tests now (was 41). Net +11 across both files.

New adapter tests in **"strict-tools body shape (Quick 009)"**:
- Tools array contains `emit_kb_response` with `input_schema` mapped to CITATION_SCHEMA (verified by checking `required` array contents)
- `tool_choice` forces the right tool name with `disable_parallel_tool_use: true`
- Retry on missing tool_use block in response
- Retry on wrong tool name in tool_use block

New adapter tests in **"text-mode fallback (ANTHROPIC_TOOLS_SUPPORTED=false)"**:
- Body does NOT contain `tools` or `tool_choice` when the flag is off
- Extraction falls back to text-content + `JSON.parse`
- JSON parse retry + Ajv retry semantics preserved

Added `"treats stop_reason='tool_use' as success"` to the happy-path describe block as an explicit lockdown.

Plus three env tests covering the new flag's default + accepted-values + typo-rejection.

## Operator-side: how the switch works now

If the operator already had `LLM_PROVIDER=anthropic` set (from Quick 008), Quick 009 takes effect on the next deploy with **zero env changes required** — `ANTHROPIC_TOOLS_SUPPORTED` defaults to `'true'`.

To revert to text mode:
```ini
ANTHROPIC_TOOLS_SUPPORTED=false
```
Restart the service. The text/JSON-discipline path from Quick 008 reactivates, with all the same retry semantics. Useful if MGTI ever regresses `tools` pass-through (escape hatch).

## Confirmed invariants

- `git diff HEAD~1 HEAD -- src/grounding/` is empty.
- `git diff HEAD~1 HEAD -- src/app/api/chat/` is empty.
- `git diff HEAD~1 HEAD -- src/llm/stream.ts` is empty — dispatcher unchanged.
- `git diff HEAD~1 HEAD -- src/llm/client.ts` is empty.
- No new package.json dependencies.
- `pnpm typecheck` clean.
- `pnpm test` — 773/773 (was 762; +11).

## Test counts

| Scope | Before | After | Delta |
|---|---|---|---|
| `src/llm/__tests__/anthropicAdapter.test.ts` | 17 | 25 | +8 |
| `src/config/__tests__/env.test.ts` | 41 | 44 | +3 |
| Whole suite | 762 | 773 | +11 |

## Deviations from plan

None. Implementation followed the plan exactly. Came in at ~50 minutes vs the 1-hour estimate, slightly under target.

## Push status

To be pushed by orchestrator after this commit lands.

## Follow-up

- **Live benchmark on Claude Sonnet 4.5** with strict-tools mode active vs the OpenAI strict-schema baseline (gpt-4o full at 7/10 on the failing Author chip per Quick 006). Operator-blocked until the MGTI Anthropic API key is provisioned via the Hubble PR flow. With Bedrock now enforcing the schema, expectation is that the failure mode shifts from `quote_not_in_body` (which the model could produce in text mode by paraphrasing) to either: (a) `allowlist_violation` (entity allowlist post-check — separate concern from Quick 009), or (b) success. The `quote_not_in_body` failure rate should drop sharply because the model's paraphrase tendency now has less surface area to express — it can only paraphrase the `quote` *field* (the validator still checks substring), not the JSON shape itself.

- **Prompt caching on the tools array** — Bedrock supports `cache_control` on tool definitions. Our tools array is byte-stable across requests (same single tool, same description, same schema). If the MGTI proxy passes through `cache_control: { type: 'ephemeral' }`, cached input tokens (system prompt + tools) drop to ~10% of normal cost. Worth a question to MGTI; could be a future Quick 010-equivalent.

- **The wider follow-up list from Quick 007/008 is unchanged**: allowlist over-strictness (now Quick 010 candidate), stochastic regression eval (Quick 011), GHA deploy.yml audit (Quick 012).

## Closes from Quick 008

This task closes the "Critical Gap (carried forward)" section from `.planning/quick/008-anthropic-provider-integration/008-SUMMARY.md`. The Anthropic path now has API-level schema enforcement equivalent to the OpenAI primary path.
