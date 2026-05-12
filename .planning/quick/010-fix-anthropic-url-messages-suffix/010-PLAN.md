---
phase: quick-010
plan: 10
type: execute
wave: 1
depends_on: [quick-008, quick-009]
files_modified:
  - src/llm/anthropicAdapter.ts
  - src/llm/__tests__/anthropicAdapter.test.ts
autonomous: true

must_haves:
  truths:
    - "Adapter URL construction now appends /messages to the path: `${baseUrl}/model/${encodedModel}/messages`."
    - "Apigee non-prod NASA proxy returns 200 OK for POST .../model/{name}/messages with a valid x-api-key; returns 404 rf-route-not-found without the /messages suffix (confirmed via live curl 2026-05-12)."
    - "All 773 pre-existing tests still pass."
  artifacts:
    - path: "src/llm/anthropicAdapter.ts"
      provides: "URL path includes /messages suffix per MGTI quickstart.md (commit 4477a7e)"
      contains: "/messages"
    - path: "src/llm/__tests__/anthropicAdapter.test.ts"
      provides: "URL assertion updated to expect /messages suffix"
      contains: "/messages"
  key_links:
    - from: "src/llm/anthropicAdapter.ts attemptRequest"
      to: "POST URL with /messages suffix"
      via: "string template literal — `${baseUrl}/model/${encoded}/messages`"
      pattern: "/messages"
---

<objective>
Fix the Anthropic adapter URL path. The original MGTI spec PDF
(BrunoTropic.pdf — `proxies/llm-anthropic/README.md` in mmctech/coreapi-apigee)
documented the Create Message endpoint as:

  POST /coreapi/llm/anthropic/v1/model/{modelName}

The MGTI quickstart.md (same commit `4477a7e`, same author, same directory)
documents it as:

  POST /coreapi/llm/anthropic/v1/model/{modelName}/messages

The /messages suffix is mandatory. Quick 008 + 009 shipped against the
spec README's documented path (without /messages) — Apigee returns 404
`rf-route-not-found` for that URL. Confirmed by live curl smoke test
against the non-prod NASA proxy on 2026-05-12 (operator: taylorkevo@gmail.com):

  Without /messages → 404 rf-route-not-found (Apigee fault)
  With /messages → 200 OK + valid Anthropic Messages API response

This task: append /messages to the adapter's URL construction and update
the URL assertion in the adapter test. One-line code change + one-line
test change. ~10 minutes.

## Why this wasn't caught earlier

Quick 008 + 009 were both shipped with full test coverage (42 tests across
the adapter and env modules), but no test could verify the URL path against
the live proxy. The adapter test asserted the URL we constructed matched a
hardcoded string from the spec — but the spec itself was wrong. The bug was
only visible at the first live-network smoke test.

This is exactly why Phase A (Bruno / curl smoke test) is the right
operator workflow before flipping LLM_PROVIDER=anthropic on prod. Catching
the bug at the curl stage saved us from a confused prod deploy that would
have 404'd every /api/chat request.

Output: A single feat commit on master + a docs commit for STATE.md.
</objective>

<context>
@.planning/STATE.md
@.planning/quick/008-anthropic-provider-integration/008-SUMMARY.md
@.planning/quick/009-anthropic-strict-tools-mode/009-SUMMARY.md
@src/llm/anthropicAdapter.ts
</context>

<discovery_findings>

## Key facts verified during the smoke test

1. **Apigee `rf-route-not-found` is route-pattern mismatch, not auth or model issue.**
   We proved this by separating the diagnosis:
   - `GET /coreapi/llm/anthropic/v1/spend` returned 200 OK with valid JSON —
     proves API key is valid and the proxy is reachable for this app.
   - `POST /coreapi/llm/anthropic/v1/model/{name}` (without /messages)
     returned 404 rf-route-not-found for every model name tried, with and
     without URL encoding.
   - `POST /coreapi/llm/anthropic/v1/model/{name}/messages` (with /messages)
     returned 200 OK with a valid Bedrock response.

2. **The spec PDF (BrunoTropic.pdf) is outdated or contains a documentation
   bug.** Both BrunoTropic.pdf and the original llm-anthropic spec PDF
   reference the path without /messages. quickstart.md (newer, same commit)
   has the correct path with /messages. The Quickstart's example request:
   ```
   curl -X POST "<base-url>/coreapi/llm/anthropic/v1/model/<modelName>/messages"
   ```

3. **Live response shape confirms tool-use mode is the right default.**
   In text-mode (no `tools` field), Claude returned valid JSON wrapped in
   markdown code fences (` ```json ... ``` `). The text-mode JSON.parse
   path in the adapter would fail on this. Tool-use mode (Quick 009
   default) sidesteps this entirely because Bedrock returns the parsed
   input object, not text. Worth noting as a separate observation; not
   blocking.

4. **Bedrock backend confirmed via response headers:**
   ```
   x-amzn-bedrock-invocation-latency: 2392
   x-amzn-bedrock-output-token-count: 42
   x-amzn-bedrock-input-token-count: 92
   amazon-bedrock-trace.guardrail.appliedGuardrailDetails.guardrailArn:
     arn:aws:bedrock:eu-west-1:534650694057:guardrail/jpyts7vqe0w3
   amazon-bedrock-guardrailAction: NONE
   ```
   Guardrail ran but took no action. EU Bedrock region confirmed.

</discovery_findings>

<tasks>

<task type="auto">
  <name>Task 1: Append /messages to adapter URL + update URL assertion</name>
  <files>
    src/llm/anthropicAdapter.ts
    src/llm/__tests__/anthropicAdapter.test.ts
  </files>
  <action>
    1. src/llm/anthropicAdapter.ts: change the URL construction in
       attemptRequest() to append /messages. Add an inline comment
       documenting the spec discrepancy and the smoke test that confirmed
       the right path.

    2. src/llm/__tests__/anthropicAdapter.test.ts: update the
       URL-construction assertion to expect /messages suffix.

    3. Verify: pnpm typecheck + pnpm test. Expect 773/773 pass.
  </action>
  <verify>
    pnpm typecheck — clean.
    pnpm test — 773/773 pass.
    git diff HEAD~1 HEAD — only src/llm/anthropicAdapter.ts + adapter
      test file modified (plus the .planning/ docs).
  </verify>
  <done>
    URL fix lands, all tests green, no other changes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Commit + push</name>
  <files>
    .planning/quick/010-fix-anthropic-url-messages-suffix/010-PLAN.md
    .planning/quick/010-fix-anthropic-url-messages-suffix/010-SUMMARY.md
    .planning/STATE.md
  </files>
  <action>
    Standard GSD quick task closeout — atomic feat commit + docs commit.

    Commit subject:
      fix(anthropic): append /messages to Create Message URL path

    Co-Author trailer: Claude Opus 4.7 (1M context).
  </action>
  <verify>
    git log -2 — both commits present.
    git push origin master — succeeds.
  </verify>
  <done>
    Commits live on origin/master, STATE.md updated.
  </done>
</task>

</tasks>

<success_criteria>
- [x] Adapter URL appends /messages
- [x] Adapter URL test assertion updated
- [x] 773/773 tests pass
- [x] Typecheck clean
- [x] Commit subject: fix(anthropic): append /messages to Create Message URL path
- [x] Co-Authored-By trailer: Claude Opus 4.7 (1M context)
</success_criteria>

<output>
After completion, create .planning/quick/010-fix-anthropic-url-messages-suffix/010-SUMMARY.md.
</output>
