---
phase: quick-009
plan: 09
type: execute
wave: 1
depends_on: [quick-008]
files_modified:
  - src/config/env.ts
  - src/config/__tests__/env.test.ts
  - src/llm/anthropicAdapter.ts
  - src/llm/__tests__/anthropicAdapter.test.ts
autonomous: true

must_haves:
  truths:
    - "Default Anthropic adapter mode is now tool-use — request body contains `tools` + `tool_choice` and the response is parsed from the tool_use content block."
    - "Bedrock enforces CITATION_SCHEMA on the tool's input field at the API level (strict-schema equivalent of OpenAI's response_format: { type: 'json_schema', strict: true })."
    - "The text/JSON-discipline path from quick-008 is preserved behind ANTHROPIC_TOOLS_SUPPORTED=false as a proxy-regression escape hatch — operator flips one env var to revert without code change."
    - "stop_reason='tool_use' is treated as success on the happy path (matches Anthropic Bedrock's documented behaviour when a tool call completes)."
    - "All 762 pre-existing tests still pass. Net delta: +11 new tests (5 strict-tools body shape + 6 text-mode-fallback). Total 773."
  artifacts:
    - path: "src/llm/anthropicAdapter.ts"
      provides: "Tool-use primary path with extractKbResponse() branching internally on ANTHROPIC_TOOLS_SUPPORTED. Sends tools+tool_choice in body, reads content[?].input from tool_use block, falls back to text-mode JSON.parse when flag=false."
      contains: "emit_kb_response"
    - path: "src/config/env.ts"
      provides: "ANTHROPIC_TOOLS_SUPPORTED env flag (enum 'true'/'false', default 'true') mirroring STRICT_SCHEMA_SUPPORTED pattern."
      contains: "ANTHROPIC_TOOLS_SUPPORTED"
  key_links:
    - from: "src/llm/anthropicAdapter.ts buildRequestBody"
      to: "tools array with emit_kb_response tool + CITATION_SCHEMA as input_schema"
      via: "branch on env().ANTHROPIC_TOOLS_SUPPORTED !== 'false'"
      pattern: "input_schema: CITATION_SCHEMA"
    - from: "src/llm/anthropicAdapter.ts extractKbResponse"
      to: "content[?].input on tool_use block"
      via: "find block with type='tool_use', validate name matches emit_kb_response"
      pattern: "type === 'tool_use'"
---

<objective>
Close the Critical Gap carried forward from Quick 008.

## Context

Quick 008 shipped the Anthropic provider via the MGTI /coreapi/llm/anthropic/v1
proxy. The adapter relied on prompt-only JSON discipline + Ajv with one
retry because the proxy spec didn't document `tools` / `tool_choice`
support — meaning the strict-schema backstop that the OpenAI primary
path enjoys (`response_format: { type: 'json_schema', strict: true }`)
was not available on the Anthropic side. This was called out as the
load-bearing risk in 008-SUMMARY.md.

The operator subsequently confirmed with MGTI that `tools` and
`tool_choice` ARE passed through to AWS Bedrock. That's the unlock for
this task.

## What this changes

Default mode for the Anthropic adapter is now strict-tools:

  1. Request body includes a `tools` array with a single `emit_kb_response`
     tool whose `input_schema` is the existing CITATION_SCHEMA. No duplicate
     schema definition anywhere — same schema the OpenAI strict-mode path
     uses, same schema the validator uses post-response.
  2. Request body includes `tool_choice: { type: 'tool', name: 'emit_kb_response',
     disable_parallel_tool_use: true }` so the model MUST call the tool and
     can only emit ONE call per response (aligns with GRND-04's ≤1-citation rule).
  3. Bedrock validates the model's tool input against CITATION_SCHEMA before
     returning — same defense-in-depth guarantee as OpenAI's strict mode.
  4. Adapter extracts content[?].input directly (no JSON.parse round-trip)
     and Ajv-validates as belt-and-suspenders.

## Operator escape hatch

If the MGTI proxy ever regresses and stops passing `tools` through to
Bedrock, the operator flips `ANTHROPIC_TOOLS_SUPPORTED=false` in
.env.production. Adapter falls back to the prompt-only text/JSON path
that quick-008 shipped — the same path with the same retry semantics,
just less defense-in-depth. No code change required to revert. Mirrors
the OpenAI `STRICT_SCHEMA_SUPPORTED` flag pattern exactly.

## Out of scope

- Live benchmark of strict-tools vs text mode against Claude Sonnet 4.5
  on the failing Author chip — operator-blocked until MGTI Anthropic API
  key is provisioned. Will produce a follow-up data point comparing pass
  rate against the local gpt-4o (full) 7/10 baseline.
- Prompt caching on the tools array — separate question for MGTI; if
  cache_control passes through, the tools definition is stable across
  requests and would benefit. Tracked as informal follow-up.

Output: A single feat commit on master + a docs commit for STATE.md.
</objective>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/quick/008-anthropic-provider-integration/008-SUMMARY.md
@src/llm/anthropicAdapter.ts
@src/grounding/schema.ts
@src/config/env.ts
</context>

<discovery_findings>

## Key facts verified before planning

1. **MGTI confirmed `tools` + `tool_choice` pass through** to AWS Bedrock.
   Source: operator (taylorkevo@gmail.com) confirmation in the conversation
   that led to this quick task.

2. **Anthropic tool-use response shape**: a successful tool call returns
   `content: [{ type: 'tool_use', id: 'toolu_...', name: '<tool-name>',
   input: <object> }]` with `stop_reason: 'tool_use'`. The `input` field
   is a pre-parsed JSON object (NOT a string) that Bedrock has validated
   against the tool's `input_schema`.

3. **`disable_parallel_tool_use: true` is the right `tool_choice` flag** to
   ensure single-tool emission. With `tool_choice: { type: 'tool', name: X }`,
   the model MUST call that tool; with `disable_parallel_tool_use: true`, it
   MUST emit only one call. Aligns with GRND-04 (≤1 citation per response).

4. **`stop_reason='tool_use'` is success, not failure.** Existing adapter
   only checks `stop_reason === 'guardrail_intervened'` as a failure
   discriminator — no change needed to that branch. The happy-path proceeds
   regardless of which stop_reason fires (end_turn for text mode, tool_use
   for tools mode, both equally valid).

5. **CITATION_SCHEMA is already JSON-Schema-compliant** and reusable as a
   tool input_schema — no duplicate schema definition needed. Verified by
   inspection of src/grounding/schema.ts (`as const satisfies JSONSchema7`).

</discovery_findings>

<tasks>

<task type="auto">
  <name>Task 1: env.ts ANTHROPIC_TOOLS_SUPPORTED flag</name>
  <files>
    src/config/env.ts
    src/config/__tests__/env.test.ts
  </files>
  <action>
    Add `ANTHROPIC_TOOLS_SUPPORTED: z.enum(['true', 'false']).optional().default('true')` to env.ts.
    Mirror the JSDoc rationale + escape-hatch language from `STRICT_SCHEMA_SUPPORTED`.

    Add tests in env.test.ts:
    - Defaults to 'true' when unset
    - Accepts 'false' (operator escape hatch)
    - Rejects typos like 'flase' (Zod enum guard)
  </action>
  <verify>
    pnpm typecheck — clean.
    pnpm test src/config/__tests__/env.test.ts — 44 pass (was 41).
  </verify>
  <done>
    Flag validates, default is 'true', test coverage matches existing flag patterns.
  </done>
</task>

<task type="auto">
  <name>Task 2: anthropicAdapter.ts — tool-use primary path</name>
  <files>
    src/llm/anthropicAdapter.ts
  </files>
  <action>
    1. Update AnthropicResponse interface to allow tool_use block fields
       (id, name, input alongside the existing text field — all optional
       since blocks vary by mode).
    2. Add KB_RESPONSE_TOOL_NAME constant ('emit_kb_response') and reuse it
       in both body construction and response extraction.
    3. Modify buildRequestBody:
       - When env().ANTHROPIC_TOOLS_SUPPORTED !== 'false':
         - Add `tools: [{ name, description, input_schema: CITATION_SCHEMA }]`
         - Add `tool_choice: { type: 'tool', name: KB_RESPONSE_TOOL_NAME, disable_parallel_tool_use: true }`
       - Else: text-mode body (unchanged from quick-008).
    4. Add extractKbResponse helper that branches on the same env flag:
       - Tools mode: find tool_use block, validate `name` matches
         KB_RESPONSE_TOOL_NAME, return `input` directly (no JSON.parse).
       - Text mode: concatenate text-block text, JSON.parse.
       - Throw on structural mismatches so the retry path in
         streamAnswerAnthropic gets one more attempt.
    5. attemptRequest: replace the inline extractText + JSON.parse with a
       single call to extractKbResponse. Guardrail check (stop_reason ===
       'guardrail_intervened') stays unchanged and runs before extraction.
    6. Keep the Ajv post-validation as belt-and-suspenders for both modes.
  </action>
  <verify>
    pnpm typecheck — clean.
  </verify>
  <done>
    Adapter sends tools+tool_choice on the default path; falls back cleanly
    on the flag-gated path; no shape regressions.
  </done>
</task>

<task type="auto">
  <name>Task 3: Test coverage — strict-tools body + text-mode fallback</name>
  <files>
    src/llm/__tests__/anthropicAdapter.test.ts
  </files>
  <action>
    1. Update existing happy-path tests to use the new mode-aware
       mockAnthropicResponse defaulting to tool_use blocks. Assertions on
       `result.response.*` remain unchanged because the adapter output
       contract is the same regardless of mode.
    2. Update body-shape test to additionally assert tools + tool_choice
       absence vs presence per mode.
    3. Add new describe block "strict-tools body shape (Quick 009)":
       - tools array has emit_kb_response + CITATION_SCHEMA as input_schema
       - tool_choice has disable_parallel_tool_use: true and the right name
       - Retry on missing tool_use block
       - Retry on wrong tool name in response
    4. Add new describe block "text-mode fallback (ANTHROPIC_TOOLS_SUPPORTED=false)":
       - Body does NOT contain tools/tool_choice
       - Extracts from text content block
       - Existing JSON parse retry + Ajv retry tests, now scoped to text mode
    5. Update env-config-respected test to use toolInput.
  </action>
  <verify>
    pnpm typecheck — clean.
    pnpm test src/llm/__tests__/anthropicAdapter.test.ts — 25 pass (was 17).
    pnpm test — 773 pass (was 762).
  </verify>
  <done>
    All adapter behaviour locked by tests across both modes, default-path
    invariants validated.
  </done>
</task>

<task type="auto">
  <name>Task 4: Commit + push</name>
  <files>
    .planning/quick/009-anthropic-strict-tools-mode/009-PLAN.md
    .planning/quick/009-anthropic-strict-tools-mode/009-SUMMARY.md
    .planning/STATE.md
  </files>
  <action>
    Standard GSD quick task closeout — atomic feat commit + docs commit.

    Commit subject:

      feat(llm): enable Anthropic strict-tools mode (closes Quick 008 critical gap)

    Co-Author trailer: Claude Opus 4.7 (1M context).
  </action>
  <verify>
    git log -2 — both commits present.
    git push origin master — succeeds.
  </verify>
  <done>
    Two commits live on origin/master, STATE.md updated with the row and
    new Last-activity narrative.
  </done>
</task>

</tasks>

<success_criteria>
- [x] ANTHROPIC_TOOLS_SUPPORTED env flag (default 'true', operator escape hatch 'false')
- [x] Adapter sends tools + tool_choice by default
- [x] disable_parallel_tool_use: true on tool_choice
- [x] input_schema reuses CITATION_SCHEMA (no duplication)
- [x] extractKbResponse branches on flag and returns the tool_use input or text-mode JSON
- [x] stop_reason='tool_use' is treated as success
- [x] Text-mode path preserved behind the flag
- [x] 773/773 tests pass (+11 net new)
- [x] Typecheck clean
- [x] Commit subject: feat(llm): enable Anthropic strict-tools mode (closes Quick 008 critical gap)
- [x] Co-Authored-By trailer: Claude Opus 4.7 (1M context)
</success_criteria>

<output>
After completion, create .planning/quick/009-anthropic-strict-tools-mode/009-SUMMARY.md.
</output>
