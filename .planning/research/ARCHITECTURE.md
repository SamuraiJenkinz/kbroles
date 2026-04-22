# Architecture Research

**Domain:** Role-aware, source-grounded enterprise AI chat assistant (stuff-the-context, no RAG)
**Researched:** 2026-04-22
**Confidence:** HIGH for citation contract, state shape, component boundaries, dev/prod swap, fallback strategy; MEDIUM for source-marker format choice (XML wins on structural fit even though OpenAI community evidence suggests both formats perform similarly on gpt-4o).

> The architectural heart of this product is the grounding layer. Everything else — SSO, chat UI, Teams wrapper — is conventional. This document is deliberately heavy on the citation contract, the streaming-parse model, and the dev/prod LLM swap because those three things are where this build will actually succeed or fail.

---

## 1. System Overview

```
┌───────────────────────────────────────────────────────────────────────────┐
│                               CLIENT (Browser / Teams tab)                 │
│                                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │Role Select  │  │ Chat Stream  │  │ Suggested    │  │ Source Panel   │  │
│  │& Landing    │  │ + Citation   │  │ Prompts Chip │  │ (section view) │  │
│  │             │  │ chips        │  │ Row (role)   │  │ colour-coded   │  │
│  └─────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬───────┘  │
│        │                 │                 │                    │          │
│        └──────── Session Store (useReducer) ───────────────────┘           │
│                         role · messages · activeCitation · openSource      │
│                                                                            │
│              ▲ SSE stream (NDJSON / chunked JSON schema)                   │
└──────────────┼─────────────────────────────────────────────────────────────┘
               │                                     ▲
               │                                     │ SSO cookie / MSAL token
┌──────────────┼─────────────────────────────────────┴─────────────────────┐
│              │               BFF / Backend for Frontend                   │
│              │                                                             │
│  ┌───────────▼────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │  /api/chat (stream)    │  │ /api/prompts  │  │ Auth middleware      │  │
│  │  - loads system prompt │  │  (role chips) │  │ (Entra ID / MSAL)    │  │
│  │  - builds messages[]   │  └───────────────┘  └──────────────────────┘  │
│  │  - proxies to LLM      │                                                │
│  │  - passes SSE through  │  ┌───────────────────────────────────────┐    │
│  └───────────┬────────────┘  │  LLM Client (OpenAI SDK, one class)   │    │
│              │                │  - baseURL from env                   │    │
│              └───────────────▶│  - auth mode from env (Bearer│api-key)│    │
│                                │  - returns async iterator of events   │    │
│                                └───────────────────┬───────────────────┘    │
│                                                     │                       │
│  ┌──────────────────────────────────────────────────┼─────────────────┐    │
│  │  Grounding Layer (pure, no I/O)                  │                 │    │
│  │  ┌────────────┐  ┌────────────────┐  ┌──────────▼────────┐        │    │
│  │  │ Source     │  │ System Prompt  │  │ Response Schema   │        │    │
│  │  │ Registry   │  │ Composer       │  │ (JSON Schema,     │        │    │
│  │  │ (3 SOPs +  │  │ (role + role   │  │  strict = true)   │        │    │
│  │  │  form map) │  │  prelude +     │  │                   │        │    │
│  │  │            │  │  <sources>)    │  │                   │        │    │
│  │  └────────────┘  └────────────────┘  └───────────────────┘        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                                     │
                                                     ▼
                          ┌──────────────────────────────────────────┐
                          │  LLM Endpoint (swappable via env)        │
                          │  dev:  api.openai.com/v1                 │
                          │  prod: MGTI Azure ingress /coreapi/...   │
                          └──────────────────────────────────────────┘
```

**Boundary rule:** the **Grounding Layer** (source registry, system-prompt composer, response schema, citation validator) is pure, synchronous, tested in isolation, and shared between the `/api/chat` route and any CLI/test harness. It has no network, filesystem-at-runtime, or auth concerns — source text is imported as static module content, baked into the bundle at build time.

---

## 2. Component Responsibilities

| Component | Responsibility | Typical implementation |
|---|---|---|
| **Role Select screen** | Present 2 (later 3) role cards; set `role` in session store; gate entry to chat. Entra SSO gate sits in front. | React component + reducer action |
| **Chat Stream** | Render `messages[]`; subscribe to SSE from `/api/chat`; parse partial JSON into `messages[current].answer`, `.citations[]`, `.canAnswer`; show typing dots until first token. | React + `fetch` + `ReadableStream` reader + partial-JSON parser (see §7) |
| **Suggested Prompts row** | Show 4 role-specific chips from static `SUGGESTED_PROMPTS[role]`; clicking sends prompt as user message. Hidden after first user message. | Presentational component; config-driven |
| **Source Panel** | Closed by default; opens when a message's first citation arrives; shows colour-coded badge, doc name, section name, rendered section body, "Open in ServiceNow" link. Re-renders when user clicks a different citation chip. | React component driven by `activeCitation` in store |
| **Auth middleware (BFF)** | Validates Entra ID token on every `/api/*` call. In Teams, accepts MSAL-issued token via `getAuthToken()`; in web, accepts the same audience via redirect/PKCE flow. Never forwards user identity to LLM — the LLM call is server-to-server. | MSAL Node on server, MSAL Browser / Teams JS SDK on client |
| **`/api/chat` route** | POST `{ role, messages }`. Composes system prompt via grounding layer, calls LLM client with `response_format: json_schema`, streams SSE back to the client. Stateless — no per-user storage. | Next.js Route Handler / Azure Functions HTTP / Express handler |
| **`/api/prompts` route** | GET `?role=…`. Returns the static suggested-prompt list. Could be inlined into client bundle instead; having it as an endpoint leaves room for role-config changes without a rebuild. | Tiny JSON handler |
| **Source Registry** | Exports typed, immutable `Source` records for the 3 docs; each has `id`, `title`, `version`, `sections[] = { id, heading, body, colour }`, `url`. Source of truth for both the system prompt and the Source Panel renderer. | TypeScript module; source markdown co-located in `src/grounding/sources/*.md` and imported as strings |
| **System Prompt Composer** | Pure function: `(role) => string`. Assembles role prelude + grounding rules + `<sources>` block + citation contract spec. Never includes user text. | TypeScript function, unit-tested against snapshot |
| **Response Schema** | Exports the JSON Schema (`strict: true`) passed to `response_format`. One canonical definition shared by backend (request) and frontend (partial-parse). | TypeScript module with `as const satisfies JSONSchema` |
| **LLM Client** | One class, env-configured. Chooses `Bearer` vs `api-key` header. Exposes `streamAnswer({ systemPrompt, messages, schema }) → AsyncIterable<StreamEvent>`. | Wraps the official `openai` npm client with `baseURL` + custom `defaultHeaders` |
| **Citation Validator** | Given a final structured response, checks every `citation.source_id` and `section_id` exists in the Source Registry. Strips hallucinated citations; if all citations invalid → rewrite response to the fallback string. | Pure TypeScript; called inside `/api/chat` before closing the SSE stream |

---

## 3. Project Structure

```
kbroles/
├── src/
│   ├── app/                          # Next.js App Router (web + API together)
│   │   ├── (auth)/
│   │   │   └── sign-in/page.tsx      # Entra login landing (SSO redirect)
│   │   ├── page.tsx                  # Role select screen
│   │   ├── chat/page.tsx             # Main chat UI (role required)
│   │   └── api/
│   │       ├── chat/route.ts         # POST - SSE chat stream
│   │       ├── prompts/route.ts      # GET  - role-specific suggestions
│   │       └── auth/[...msal]/       # MSAL token endpoints
│   │
│   ├── grounding/                    # PURE, framework-agnostic, unit-tested
│   │   ├── sources/
│   │   │   ├── kb0020882.md          # SOP text, verbatim, with <!-- section:id --> markers
│   │   │   ├── kb0022991.md
│   │   │   └── servicenow-form.md
│   │   ├── registry.ts               # parses .md files → Source[] at build time
│   │   ├── systemPrompt.ts           # composeSystemPrompt(role) => string
│   │   ├── schema.ts                 # Response JSON Schema (strict)
│   │   ├── validator.ts              # validateCitations(response, registry)
│   │   └── __tests__/
│   │       ├── systemPrompt.snap.ts
│   │       └── validator.test.ts
│   │
│   ├── llm/                          # Endpoint-swappable LLM client
│   │   ├── client.ts                 # createLlmClient() — env-driven
│   │   ├── stream.ts                 # parseSseToStreamEvents()
│   │   └── types.ts                  # StreamEvent, ChatRequest, ChatResponse
│   │
│   ├── ui/                           # React components
│   │   ├── RoleSelect.tsx
│   │   ├── ChatStream.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── CitationChip.tsx
│   │   ├── SuggestedPrompts.tsx
│   │   ├── SourcePanel.tsx
│   │   └── RoleBadge.tsx
│   │
│   ├── state/                        # Client-side session state
│   │   ├── session.ts                # useReducer + context provider
│   │   └── types.ts                  # SessionState, Action
│   │
│   ├── auth/                         # MSAL wrappers (client + server)
│   │   ├── client.ts                 # MSAL Browser (web mode)
│   │   ├── teams.ts                  # microsoftTeams.getAuthToken() (Teams mode)
│   │   ├── server.ts                 # MSAL Node — token validation on API routes
│   │   └── detectHost.ts             # web vs Teams (checks if inside Teams frame)
│   │
│   └── config/
│       ├── env.ts                    # Typed env loader (zod) — reads LLM_MODE etc.
│       └── suggestedPrompts.ts       # Role → chip[] map
│
├── teams/
│   ├── manifest.json                 # Teams app manifest
│   └── icons/
│
└── .planning/ …
```

### Rationale

- **`src/grounding/` is the core of the product.** It is pure, has no imports from `app/`, `ui/`, or `llm/`, and is the one place where source text and the citation contract live. Anything that needs to reason about "what can this assistant say" reads from here.
- **`src/llm/` is the one place env branching lives.** Nothing else in the codebase knows whether we're in dev or prod — that detail is encapsulated inside `createLlmClient()`.
- **`src/ui/` components know nothing about LLMs.** They consume `SessionState` and dispatch actions. That keeps the chat UI testable with fixture streams.
- **Next.js App Router is the specific example** but the structure works the same on Remix, Vite + Express, or Azure Static Web Apps + Functions. The important boundary is: **grounding is independent of the web framework**.

---

## 4. The Citation Contract (MOST IMPORTANT)

This is the load-bearing interface of the product. Everything — the system prompt, the model's response schema, the frontend parser, the source panel — conforms to this contract.

### 4.1 Source marker format in the system prompt — **XML-style tags**

**Decision:** XML tags for source boundaries, markdown for section headings inside.

**Rationale:**
- XML tags give the model a hard, unambiguous delimiter ("everything between `<source>` and `</source>` is one document"). Tokenisers handle angle-bracketed tags well and the model is trained on this pattern across OpenAI's and Anthropic's examples. Community benchmarks (see sources) show XML and Markdown perform similarly on gpt-4o for adherence, but **XML is easier to parse programmatically if we ever need to audit the system prompt**, and it gives us a stable place to put machine-readable attributes (`id`, `version`, `url`).
- Markdown headings inside the source body preserve the original SOP structure (so the model can reference `§ Flagging Articles` as it naturally appears).
- HTML-style comments `<!-- section:flagging-articles -->` inside the markdown give us machine-parseable section anchors without visually polluting the source text.

**Exact format — what goes into the system prompt:**

```xml
<sources>
<source id="KB0020882" title="Submit New/Update Technical Knowledge Article SOP"
        version="9.0" url="https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0020882">
<!-- section:who-can-submit -->
## Who Can Submit
Tier II and Tier III support groups submit on behalf of Tier I…

<!-- section:article-creation -->
## Article Creation Steps
1. Navigate to the Knowledge home page…

<!-- section:naming-convention -->
## Article Naming Convention
[Application/Topic] - [Type Descriptor] - [OPCO or LoB] - [Region]…
</source>

<source id="KB0022991" title="Technical Knowledge Base Article Management SOP"
        version="13.0" url="https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0022991">
<!-- section:flagging-articles -->
## Flagging Articles
Any user with read access can flag an article…

<!-- section:publishing -->
## Publishing an Article
…
</source>

<source id="SNOW_FORM" title="ServiceNow Technical Knowledge Article Form"
        version="live" url="https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB18801781">
<!-- section:required-fields -->
## Required Fields
…
</source>
</sources>
```

The composer also emits an explicit citation contract inside the system prompt so the model knows the rules:

```
<citation_contract>
You MUST respond by calling the structured output schema. Every answer must cite
exactly one (source_id, section_id) pair. Valid source_id values: KB0020882,
KB0022991, SNOW_FORM. Valid section_id values: only the anchors that appear
as <!-- section:ID --> markers in <sources> above. Never invent field names,
workflow steps, approver names, or section IDs. If the question is not answered
by the content inside <sources>, set can_answer=false and use the fallback text
verbatim: "That information isn't in the loaded documents yet. Flag the gap to
the CTSS Knowledge team via KB0022991."
</citation_contract>
```

### 4.2 Model output format — **Structured output via JSON Schema, `strict: true`**

**Decision:** The model responds via `response_format: { type: "json_schema", json_schema: { strict: true, schema: … } }`. No inline `[cite:…]` markers. The citation is a structured field.

**Rationale:**
- **Determinism.** Strict structured outputs use constrained decoding — the grammar literally cannot produce an invalid `source_id`. Inline markers are free-form and the model will occasionally malform them.
- **Streaming works.** Partial JSON can be parsed progressively (see §7) so the user still sees typed-out prose.
- **Parsing is trivial.** No regex over prose. The citations are a typed array; the UI wires the array directly to `CitationChip` components.
- **`refusal` field.** OpenAI's structured-output API returns a dedicated `refusal` string when the model won't answer — we treat this the same as `can_answer: false` and map to the documented fallback.

**The canonical schema** (also exported from `src/grounding/schema.ts`):

```ts
export const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["can_answer", "answer", "citations"],
  properties: {
    can_answer: {
      type: "boolean",
      description: "True if the question is covered by the <sources> block. False triggers the fallback."
    },
    answer: {
      type: "string",
      description:
        "The plain-language answer for the user. If can_answer=false, use the fallback text verbatim."
    },
    citations: {
      type: "array",
      minItems: 0,           // 0 when can_answer=false; otherwise the model must include ≥1
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source_id", "section_id", "quote"],
        properties: {
          source_id: { type: "string", enum: ["KB0020882", "KB0022991", "SNOW_FORM"] },
          section_id: {
            type: "string",
            description: "Must match a <!-- section:ID --> anchor that appears inside <sources>."
          },
          quote: {
            type: "string",
            maxLength: 280,
            description:
              "A short (≤280 char) verbatim excerpt from the cited section that supports the answer."
          }
        }
      }
    }
  }
} as const;
```

**Why `quote` is in the schema.** It's an extra integrity check, nearly free at runtime: the server-side validator searches the cited section body for the quote substring. If it isn't found verbatim, the citation is stripped (and if all citations are stripped, the answer is replaced with the fallback). This kills the "plausible but hallucinated" citation failure mode cheaply.

### 4.3 End-to-end flow for one citation

```
┌─────────────────────────────────────────────────────────────────────────┐
│ System prompt contains:                                                  │
│   <source id="KB0022991"> … <!-- section:flagging-articles --> …         │
└──────────┬──────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Model emits (constrained JSON):                                          │
│   {                                                                      │
│     "can_answer": true,                                                  │
│     "answer": "Click Flag Article in the article header, enter a        │
│                reason, and submit …",                                    │
│     "citations": [{                                                      │
│       "source_id": "KB0022991",                                          │
│       "section_id": "flagging-articles",                                 │
│       "quote": "Click Flag Article button in the article header"         │
│     }]                                                                   │
│   }                                                                      │
└──────────┬──────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Citation Validator (server):                                             │
│  for each citation:                                                      │
│    - registry.sources[source_id] exists?                                 │
│    - that source has a section with id = section_id?                     │
│    - section.body includes citation.quote?                               │
│  → If all pass: forward to client.                                       │
│  → If any fail: strip the citation.                                      │
│  → If zero citations remain and can_answer was true: overwrite answer   │
│    with fallback, set can_answer=false.                                  │
└──────────┬──────────────────────────────────────────────────────────────┘
           │  SSE → client
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Chat UI:                                                                 │
│  - Renders `answer` (already streaming into the bubble).                 │
│  - Renders one <CitationChip> per entry in citations[].                  │
│  - First citation auto-opens the <SourcePanel>, which looks up the       │
│    section in the shared registry and renders its body.                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Why not inline markers (or both)

- **Inline markers alone** (e.g. `[cite:KB0022991#flagging-articles]` in prose) require regex parsing, are easy for the model to malform, and can't be constrained by a grammar. Parsing mid-stream is fragile.
- **Both inline + structured** sounds belt-and-braces but doubles the failure surface (the model can get the structured side right and the inline side wrong, or vice versa) and costs tokens. Not worth it.
- **Structured-only is the minimum viable contract that is also maximally reliable.** If we ever want visual inline anchors in the rendered bubble (e.g. superscript ¹ next to the specific claim), we can add that as a client-side renderer step that matches `citation[i].quote` against the answer text and injects anchors — done post-hoc, still from structured data, no prompt contract change.

---

## 5. Data Flow — one Q&A turn

```
USER types "How do I flag an article?" (role = consumer)
  │
  ▼
ChatStream dispatches SEND_MESSAGE
  sessionState.messages.push({ role: 'user', content: '…' })
  │
  ▼
ChatStream fetch('/api/chat', { method: POST,
  body: { role: 'consumer', messages: [...] } }, credentials: 'include')
  │
  ▼  (BFF)
Auth middleware validates MSAL token on request
  │
  ▼
/api/chat handler:
  1. systemPrompt = composeSystemPrompt('consumer')
  2. llm = createLlmClient()                 // env-driven endpoint + auth mode
  3. stream = llm.streamAnswer({
       systemPrompt,
       messages: body.messages,
       schema: responseSchema
     })
  4. SSE response: res.write('data: ' + JSON.stringify(event) + '\n\n')
     for each stream event:
       - { type: 'partial', delta }       ← partial JSON, emitted ASAP
       - { type: 'done', final }          ← after model finishes & validator runs
       - { type: 'refusal', message }     ← structured-output refusal mapped to fallback
  │
  ▼  (client)
ChatStream reads SSE, feeds into partial-JSON parser:
  - as soon as `answer` field starts streaming, update messages[current].answer
  - as soon as a complete citation object lands, push into messages[current].citations
  - when first citation lands, dispatch OPEN_SOURCE_PANEL(citation[0])
  │
  ▼
SourcePanel subscribes to activeCitation:
  - looks up source = registry[activeCitation.source_id]
  - looks up section = source.sections.find(s => s.id === activeCitation.section_id)
  - renders colour-coded badge (from source.colour + section.colour override map),
    section heading, section body, "Open in ServiceNow ↗"
  │
  ▼
On 'done' event:
  - Citation Validator has already run server-side; if any citation was stripped,
    `done.final.citations` differs from what streamed — UI reconciles by replacing
    messages[current].citations with done.final.citations.
  - Typing dots hidden; message marked complete.
```

The **reconciliation step on `done`** is important: partial JSON may briefly contain a citation that the validator later strips (e.g. a hallucinated `section_id`). The safest UX is to display streamed citations tentatively and snap to the validated set when `done` arrives. For the pilot, simpler acceptable alternative: hold citations until `done`, only stream `answer` text. This trades a little perceived speed for zero flicker. **Recommended for v1: hold citations until `done`.** Revisit if pilot users complain about delay — they won't.

---

## 6. State Shape

```ts
// src/state/types.ts

export type Role = 'consumer' | 'author';  // string union, easy to extend to 'admin'

export type Citation = {
  sourceId: 'KB0020882' | 'KB0022991' | 'SNOW_FORM';
  sectionId: string;
  quote: string;
};

export type ChatMessage =
  | { id: string; role: 'user'; content: string }
  | {
      id: string;
      role: 'assistant';
      status: 'streaming' | 'complete' | 'error';
      canAnswer: boolean | null;      // null while streaming, boolean after 'done'
      answer: string;                  // grows during stream
      citations: Citation[];           // populated on 'done' (v1)
    };

export type SessionState = {
  role: Role | null;                   // null = pre-role-select
  host: 'web' | 'teams';               // detected once at mount
  auth: { status: 'signedOut' | 'signingIn' | 'signedIn'; displayName?: string };

  messages: ChatMessage[];
  input: string;                       // controlled chat input

  // Source panel
  panel: {
    isOpen: boolean;
    activeCitation: Citation | null;   // drives which section renders
  };
};

export type Action =
  | { type: 'SET_ROLE'; role: Role }
  | { type: 'CHANGE_ROLE' }                               // resets messages, keeps auth
  | { type: 'SIGN_IN_COMPLETE'; displayName: string }
  | { type: 'INPUT'; value: string }
  | { type: 'SEND_MESSAGE'; id: string; content: string }
  | { type: 'STREAM_START'; assistantId: string }
  | { type: 'STREAM_ANSWER_DELTA'; assistantId: string; delta: string }
  | { type: 'STREAM_DONE'; assistantId: string; canAnswer: boolean; citations: Citation[] }
  | { type: 'STREAM_ERROR'; assistantId: string; message: string }
  | { type: 'OPEN_SOURCE'; citation: Citation }
  | { type: 'CLOSE_SOURCE' };
```

**Why a single reducer over multiple contexts or Zustand stores:** the state is small (conversation + one open panel), tightly coupled (sending a message triggers a panel open), and session-only. `useReducer` + a provider keeps everything observable, deterministic, and testable with action replay. Introducing Zustand/Redux is justified if conversation persistence, multi-tab sync, or cross-component selectors become needed — none are in scope.

---

## 7. Streaming + Citation Parsing

The tension: structured output is great for determinism but naturally lands as *one JSON blob*, which kills the typing-out illusion. Solutions, ranked:

### Recommended: **Partial JSON parsing of the `answer` field only; citations held until `done`**

1. Use a tolerant partial-JSON parser on the stream buffer (several open-source options exist — `partial-json`, `openai-partial-stream`, or a small 60-line custom parser that only tracks the `"answer"` key). On every delta, try to extract the latest string value for `answer`; dispatch `STREAM_ANSWER_DELTA`.
2. Ignore `citations` and `can_answer` until the server emits `done` (after the citation validator has run).
3. On `done`, dispatch `STREAM_DONE` with the validated citations; first citation auto-opens the Source Panel.

**Why this is the right v1 choice:**
- Zero flicker from citations appearing then being stripped by the validator.
- Parser is trivial because `answer` appears early in the schema (it's the second key after `can_answer`) and is a simple string.
- Works identically whether the model streams 50 tokens or 500.

### Alternative if perceived latency on citations becomes a complaint

Stream citations as they land (use a true incremental JSON parser like Vercel AI SDK's `streamObject` partial-object stream, or `openai-partial-stream`). Mark streamed citations with a "pending" class; on `done`, reconcile against the validated set. More moving parts, minor UX improvement.

### Schema key order matters

In the JSON Schema, place `can_answer` first, `answer` second, `citations` last. Constrained decoding emits keys in schema order, so the user sees `answer` streaming earliest and citations only arrive at the end — which lines up exactly with the "hold citations until done" strategy.

---

## 8. Out-of-scope Fallback Strategy

**Layered defence, three lines:**

### Line 1 — Prompt discipline (cheapest, catches most)

System prompt explicitly instructs: *"If the question is not answered by content inside `<sources>`, set `can_answer=false` and answer with this exact string: …"*. Include 1-2 few-shot examples inside the system prompt (a clearly in-scope Q&A with citation, a clearly out-of-scope Q&A with `can_answer=false` + fallback). gpt-4o is well-behaved when the out-of-scope behaviour is demonstrated by example.

### Line 2 — Schema discipline

The `can_answer: boolean` field forces the model to *classify* its own answer. If it commits `can_answer=false`, the schema still demands an `answer` and allows `citations: []`. The UI treats `can_answer=false` as a terminal state: render the fallback text in a distinct tone (amber badge), **do not open the Source Panel**, show an optional "How do I flag this gap?" chip that pre-fills a follow-up pointing to the KB0022991 flagging section (which *is* in scope — a small nice touch that turns the failure mode into a next action).

### Line 3 — Citation validator as final gate

If `can_answer=true` but every citation is invalid (bad `source_id`, bad `section_id`, or `quote` not found in source body), the validator flips the response to the fallback before it reaches the client. This handles the "model confidently cites a hallucinated section" case that the other two layers would miss.

### What not to do

Do **not** run a second-pass classifier. It's slower, it doubles spend, and with strict structured output + validator in place there's no measurable gain. Keep it to one model call.

### Observability for the pilot

Log (anonymised, server-side only, no user content) the rate at which:
- `can_answer=false` is returned (baseline out-of-scope rate)
- the validator had to strip a citation (model drift signal)
- the validator had to flip a response to fallback (hard failure signal)

Spike in flipped-to-fallback = source prompt drift or a model update — investigate immediately. This is the monitoring signal that tells us grounding is still working without needing user complaints.

---

## 9. Role-specific Behaviour — one prompt, role parameter

**Decision:** A single system-prompt template, parameterised by role. Role is a first-class input to `composeSystemPrompt(role)` and a first-class field on every `/api/chat` request.

```ts
// src/grounding/systemPrompt.ts
export function composeSystemPrompt(role: Role): string {
  return [
    ROLE_PRELUDES[role],         // role-specific tone & priorities (2-5 sentences)
    COMMON_RULES,                // grounding, citation contract, fallback
    renderSources(REGISTRY),     // <sources>…</sources>
    FEW_SHOT_EXAMPLES[role],     // 1-2 role-specific Q&A pairs
    CITATION_CONTRACT            // repeated at the end — recency bias helps adherence
  ].join('\n\n');
}
```

**Rationale vs alternatives:**

| Approach | Chosen? | Why |
|---|---|---|
| One prompt, role parameter inside a template | ✅ | Single source of truth for the grounding contract. Role tweaks are additive, not forked. Easy to A/B test a role-prelude change without touching the rest. |
| Separate system prompts per role | ❌ | Two prompts drift. When grounding rules change (they will), they have to change in N places. |
| Server-side "assistants" (OpenAI Assistants API) | ❌ | Assistants API is a heavier runtime (threads, file search, server-managed state). We want stateless request/response and no server-managed conversation state. |
| Role encoded in user message header | ❌ | Injection surface and less visible at review time. |

**Extension path to 3 roles:** add a third entry to `ROLE_PRELUDES`, `FEW_SHOT_EXAMPLES`, and `SUGGESTED_PROMPTS`. The rest of the pipeline doesn't change. The `Role` type is a string union — TypeScript will drive you to every call site that needs updating.

---

## 10. Dev/Prod LLM Endpoint Swap

**Decision:** Single `createLlmClient()` factory, env-driven. Both dev and prod use the official `openai` npm package; the difference is `baseURL`, auth-header mode, and (for prod) model deployment name.

```ts
// src/llm/client.ts
import OpenAI from 'openai';
import { env } from '@/config/env';

export function createLlmClient() {
  const authMode = env.LLM_AUTH_MODE;     // 'bearer' | 'api-key'
  const baseURL  = env.LLM_BASE_URL;      // https://api.openai.com/v1  OR  https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/v1
  const apiKey   = env.LLM_API_KEY;

  return new OpenAI({
    baseURL,
    apiKey: authMode === 'bearer' ? apiKey : 'placeholder', // openai SDK requires non-empty
    defaultHeaders: authMode === 'api-key'
      ? { 'api-key': apiKey }                               // Azure / MGTI style
      : undefined,
  });
}
```

```ts
// src/config/env.ts
import { z } from 'zod';
const Env = z.object({
  LLM_AUTH_MODE: z.enum(['bearer', 'api-key']),
  LLM_BASE_URL:  z.string().url(),
  LLM_API_KEY:   z.string().min(1),
  LLM_MODEL:     z.string().default('gpt-4o'),
  // MSAL / Entra
  ENTRA_TENANT_ID: z.string(),
  ENTRA_CLIENT_ID: z.string(),
  ENTRA_CLIENT_SECRET: z.string().optional(),  // server-side confidential client
});
export const env = Env.parse(process.env);
```

**Local `.env.development`:**
```
LLM_AUTH_MODE=bearer
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-…
LLM_MODEL=gpt-4o-2024-08-06
```

**Prod (Azure App Service / Static Web Apps Configuration):**
```
LLM_AUTH_MODE=api-key
LLM_BASE_URL=https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/v1
LLM_API_KEY=<MGTI-issued key>
LLM_MODEL=<MGTI deployment name, e.g. gpt-4o>
```

**Invariants:**
- No `if (process.env.NODE_ENV === 'production')` branching in application code — ever.
- `env` is validated at boot; misconfigured envs fail fast with a readable error.
- Model deployment name is also env-driven because MGTI typically uses deployment names, not raw model IDs.
- The OpenAI SDK tolerates the `api-key` header override (we still pass a non-empty `apiKey` to satisfy the SDK, but the override header takes precedence when hitting the MGTI ingress).
- Confirm in early smoke test that the MGTI endpoint accepts `response_format: json_schema` in strict mode. If a given Azure deployment doesn't, we fall back to `json_object` + server-side JSON Schema validation (retry once on failure). Keep both paths behind the same `streamAnswer` facade so the call site doesn't change.

---

## 11. Suggested Prompts, Role Badge, Source Panel — wiring

All three read from `SessionState`. None of them fetch or own data independently.

- **Role badge** (top of chat header): `state.role` → displayed name + avatar colour. Clicking "Change role" dispatches `CHANGE_ROLE`, which clears `messages`, closes the panel, and returns to `role: null` (Role Select screen re-renders).
- **Suggested prompts row**: reads `SUGGESTED_PROMPTS[state.role]` from config. Visible only when `state.messages.filter(m => m.role === 'user').length === 0`. Clicking a chip dispatches `SEND_MESSAGE` with the chip's text.
- **Source Panel**: reads `state.panel.isOpen` and `state.panel.activeCitation`. Renders nothing when `!isOpen`. When open, looks up `registry[activeCitation.sourceId].sections.find(s => s.id === activeCitation.sectionId)` and renders colour-coded header + section body + ServiceNow link.

Because everything reads from one reducer, the three components can be refactored independently, tested in isolation with fixture state, and animated (panel slide-in) without coordinating through events.

---

## 12. Architectural Patterns

### Pattern 1 — Registry as single source of truth

**What:** The `Source Registry` (loaded from `src/grounding/sources/*.md` at build time) is the one authoritative representation of every SOP and every section. The system prompt, the validator, and the Source Panel all read from the same registry object.
**When to use:** Any time document text + structured metadata need to stay in lockstep across server and client.
**Trade-offs:** Requires a small build step (or runtime parser) to turn markdown-with-comment-anchors into typed objects. Worth it — no drift between what the model sees and what the UI renders.

```ts
// Simplified:
type Section = { id: string; heading: string; body: string; colour: Colour };
type Source  = { id: string; title: string; version: string; url: string; colour: Colour; sections: Section[] };
export const REGISTRY: Record<string, Source> = parseSourceMarkdown([
  require('./sources/kb0020882.md'),
  require('./sources/kb0022991.md'),
  require('./sources/servicenow-form.md'),
]);
```

### Pattern 2 — Schema as contract across server and client

**What:** One TypeScript module exports the JSON Schema used by both the LLM request (`response_format.json_schema.schema`) and the client-side partial parser (which knows the field order to expect `answer` early). The schema is `as const satisfies JSONSchema` so types stay in sync.
**Trade-offs:** Tighter coupling across the network boundary — but since the boundary exists precisely to enforce this schema, the coupling is a feature.

### Pattern 3 — Pure grounding layer, impure adapters

**What:** `src/grounding/*` has no I/O, no `fetch`, no framework imports. Every function is pure, every piece of data is immutable. `src/llm/*` and `src/app/api/*` are the only modules allowed to do I/O. UI components receive data via props/context and dispatch actions.
**When to use:** Any time you have a load-bearing domain and you're going to need to unit-test it heavily.
**Trade-offs:** A few extra module boundaries. Pays back immediately in testability — you can snapshot the entire system prompt, replay validator cases, and diff the source registry without a running server.

### Pattern 4 — BFF pass-through with minimal transformation

**What:** The `/api/chat` route is deliberately thin: compose prompt, call LLM, validate citations, stream SSE. It does *not* reshape messages, inject tools, or implement conversation memory (there is none). If we need to add retries, circuit breaking, or a model-change fallback, it goes inside `src/llm/client.ts`, not in the route handler.
**Trade-offs:** Some temptation to put logic in the route (it's easy to reach). Resist; keep the route boring.

### Pattern 5 — Host detection for dual-mode (web vs Teams)

**What:** At mount, `detectHost()` checks whether the page is running inside a Teams iframe (via `microsoftTeams.app.isInitialized()` or parent-origin check). Based on the result:
- Teams → use `microsoftTeams.authentication.getAuthToken()` for SSO.
- Web → use MSAL Browser PKCE redirect flow.
Both return an Entra ID token bound to the same App Registration audience, so the BFF validates either identically.
**Trade-offs:** One extra module. Everything else in the app is mode-agnostic — no duplicate routes, no duplicate UI.

---

## 13. Anti-Patterns

### Anti-Pattern 1 — Inline citation markers parsed with regex

**What people do:** `"...per KB0022991 §Flagging Articles [cite:KB0022991#flagging]"` and parse `\[cite:([^\]]+)\]` on the client.
**Why it's wrong:** Non-deterministic (model malforms markers under token pressure), stream-parsing is fragile (marker split across chunks), no way to enforce valid source IDs.
**Do instead:** Structured output with `enum` on `source_id`. If visual inline anchors are needed, compute them client-side from the structured citations.

### Anti-Pattern 2 — Retrieving source text in the route handler on every request

**What people do:** Load and parse the SOP markdown files on each `/api/chat` invocation.
**Why it's wrong:** Unnecessary I/O, slow cold starts, and the source corpus is the same for every user — it should be a cached, immutable module.
**Do instead:** Import source `.md` as strings at build time; the registry is a module-level constant. The build artefact is versioned, auditable, and redeployed when SOPs update — which matches the "manual re-embed per release" decision in `PROJECT.md`.

### Anti-Pattern 3 — Mixing conversation memory with stateless design

**What people do:** Start "session-only", then add "just a tiny cache" for common questions, then add Redis, then add a user table…
**Why it's wrong:** Kills the zero-storage, zero-PII property of the product. Every addition brings compliance review.
**Do instead:** Stay stateless. If product wants "recent questions", store in `localStorage` (client-side). Per `PROJECT.md`, "Session-only conversations … zero-regret choice" — hold that line.

### Anti-Pattern 4 — Separate frontend and backend repos

**What people do:** Split the UI and API into two repos to "separate concerns".
**Why it's wrong:** The citation contract (schema, source registry, types) needs to be shared between server and client. Two repos mean publishing a shared package or duplicating types — the first is overkill, the second drifts.
**Do instead:** Single repo, single TypeScript project. If the hosting model needs separate deploys (static site + functions), that's a deploy concern, not a code-organisation concern.

### Anti-Pattern 5 — Chasing "proper RAG" prematurely

**What people do:** "We'll do stuff-the-context now and add RAG when the corpus grows" → starts building RAG on day 3 for peace of mind.
**Why it's wrong:** RAG introduces retrieval failure modes (wrong chunk, missing context, chunk boundary mid-sentence). With 10–15K tokens and a 128K window, full-context is both simpler and more reliable.
**Do instead:** Defer. The architecture already sets up migration cleanly: replace `renderSources(REGISTRY)` with `renderSources(retrieveRelevantSections(query, REGISTRY))` when the corpus grows past ~50K tokens. Nothing else changes.

### Anti-Pattern 6 — Double-call "validator LLM" to judge the first LLM

**What people do:** After gpt-4o answers, call another LLM to check "was this answer grounded?".
**Why it's wrong:** Doubles cost and latency. The structured-output schema + deterministic citation validator cover this case deterministically and cheaply.
**Do instead:** Structured output + quote-substring check + source-registry lookup. Only consider an LLM-judge pattern if the pilot shows a class of errors the deterministic check can't catch.

---

## 14. Scaling Considerations

The product is scoped to a pilot cohort then (maybe) broader MMC Tech rollout. Scaling concerns here are **token economics and endpoint throughput**, not user count.

| Scale | Adjustments |
|---|---|
| Pilot (≤50 concurrent users) | No changes. Stateless BFF, single Azure App Service or Static Web Apps deployment. gpt-4o at ~10K system-prompt tokens/turn + ~500 answer tokens is ~$0.05/turn retail; MGTI pricing is governed separately. |
| Broader MMC Tech (≤5K concurrent users) | Add response caching keyed on `hash(role + normalized question)` with a 15-min TTL — cuts 40–70% of repeat traffic on frequently-asked prompts. No user-identifying data in the key. |
| Corpus growth beyond 3 docs | Monitor system prompt token count. At ~40–50K tokens we start paying both in latency and in "lost in the middle" grounding accuracy. At that point move to section-level RAG (keep the registry, add a retriever that returns the top-K sections to splice into `<sources>`). The citation contract is unchanged. |
| MGTI ingress rate limits | Add a per-route concurrency limiter (e.g. 20 in-flight requests) and a simple queue with 429 response if exceeded. Surface "We're busy — please retry in a moment" in the chat, not a blank failure. |

### Scaling priorities — what breaks first

1. **MGTI ingress quota.** Before you hit any other limit, you'll hit a per-minute token or request quota. Instrument this from day one with a token-usage counter per response.
2. **Perceived latency on long answers.** Stream from the first token — any architecture choice that blocks on the full JSON before rendering will feel slow. The partial-parser approach prevents this.
3. **Source drift.** Not a scale issue per se — it's a pilot-to-prod reliability issue. Set up a release checklist that includes "run the validator suite against the updated source registry" so a reworded SOP section doesn't silently break every citation quote-match.

---

## 15. Integration Points

### External services

| Service | Integration pattern | Notes |
|---|---|---|
| MGTI Azure OpenAI ingress | OpenAI-compatible SDK; `baseURL` override + `api-key` header | Confirm `response_format: json_schema` strict-mode support on the deployment before committing. |
| Entra ID / Azure AD | MSAL Browser (web) + Teams JS SDK (`getAuthToken`) for client tokens; MSAL Node on server for token validation | Single App Registration; audience used identically in both hosts. |
| ServiceNow | **Outbound link only.** No API integration in v1. Source Panel footer links to `https://mmcnow.service-now.com/kb_view.do?sysparm_article={KB_NUMBER}`. | Write-back explicitly out of scope per PROJECT.md. |
| Microsoft Teams | Packaged as a personal tab via `teams/manifest.json` pointing at the same web URL | Manifest registered in Teams Admin Center; same App Registration. |

### Internal boundaries

| Boundary | Communication | Notes |
|---|---|---|
| `ui/` ↔ `state/` | React context + dispatch | No direct API calls from UI; actions are the only side-effect trigger. |
| `state/` ↔ `app/api/chat` | `fetch` + SSE | Thunk-like async action `sendMessageAndStream` owns the fetch; dispatches STREAM_* actions as events arrive. |
| `app/api/chat` ↔ `grounding/` | Direct function call (same process) | Composer, registry, validator all imported. |
| `app/api/chat` ↔ `llm/` | Direct function call | `createLlmClient().streamAnswer({…})`. |
| `llm/` ↔ external LLM endpoint | HTTPS, OpenAI SDK | Only module with outbound HTTP. |

---

## 16. Suggested Build Order (dependency graph)

```
Phase A: Grounding substrate
   1. src/grounding/sources/*.md  (verbatim SOP text + section anchors)
   2. src/grounding/registry.ts   (markdown → Source[])
   3. src/grounding/schema.ts     (response JSON Schema)
   4. src/grounding/systemPrompt.ts (composer + role preludes + few-shots)
   5. src/grounding/validator.ts  (citation validator)
   6. Snapshot tests on composer output; unit tests on validator

Phase B: LLM adapter
   7. src/llm/client.ts           (env-driven, dual auth mode)
   8. src/llm/stream.ts           (SSE → StreamEvent async iterator)
   9. Smoke script: one-shot call to both dev (OpenAI) and a staging MGTI deployment
       proving structured output + strict mode work on both

Phase C: BFF
  10. src/app/api/chat/route.ts   (SSE pass-through with validator)
  11. src/app/api/prompts/route.ts
  12. Basic MSAL token validator middleware (can be stubbed for local dev)

Phase D: Session & UI skeleton
  13. src/state/*                 (reducer + provider)
  14. src/ui/RoleSelect + Role badge
  15. src/ui/ChatStream + ChatMessage (without citations yet)
  16. Wire fetch + partial-JSON answer parsing end-to-end
       → at this milestone the app can answer, just no citations rendered

Phase E: Citations & Source Panel
  17. src/ui/CitationChip
  18. src/ui/SourcePanel (reads from same REGISTRY)
  19. Wire OPEN_SOURCE on first citation arrival; panel colour coding from registry
  20. Reconciliation logic on 'done' event

Phase F: SSO
  21. src/auth/client.ts (MSAL Browser — web mode)
  22. src/auth/teams.ts  (microsoftTeams.getAuthToken — Teams mode)
  23. src/auth/detectHost.ts
  24. src/auth/server.ts (token validation on API routes)
  25. Sign-in redirect + role gate

Phase G: Teams wrapper
  26. teams/manifest.json
  27. Manual packaging + Teams Admin registration
  28. Smoke test: same URL, same codebase, works in Teams

Phase H: Pilot hardening
  29. Observability: structured logs for validator-flip, refusal, token usage
  30. Error states: LLM timeout, validator-flip → fallback UI, 429 / rate-limit
  31. Cache layer (only if pilot feedback shows repeat-question volume)
```

**Critical path to a demoable build:** Phases A → B → C → D. At the end of Phase D you have a working Q&A chat with validated answers but no citation UI — roughly half the pilot-ready work. Phases E–F are parallelisable with two developers.

**Hard dependencies (will block if skipped):**
- A must exist before C (the route has nothing to send without the composer + registry + schema).
- B must exist before C (route can't call LLM without client).
- D depends on the API route being callable (stubbed SSE is fine for early UI work).
- E depends on the registry shape being stable (swap to unstable registry breaks the panel).
- F can happen in parallel with D/E if local dev uses a stub auth middleware.

---

## 17. Sources

- [Structured model outputs | OpenAI API](https://developers.openai.com/api/docs/guides/structured-outputs) — JSON Schema strict mode, `refusal` field, streaming semantics (HIGH)
- [Introducing Structured Outputs in the API | OpenAI](https://openai.com/index/introducing-structured-outputs-in-the-api/) — constrained decoding guarantees (HIGH)
- [Streaming using Structured Outputs — OpenAI Developer Community](https://community.openai.com/t/streaming-using-structured-outputs/925799) — partial JSON behaviour during streams (MEDIUM)
- [Streaming API responses | OpenAI API](https://developers.openai.com/api/docs/guides/streaming-responses) — SSE event shapes (HIGH)
- [openai-partial-stream (GitHub)](https://github.com/st3w4r/openai-partial-stream) — partial JSON parsing approach (MEDIUM)
- [AI SDK Core: streamObject](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-object) — partial-object stream pattern (HIGH)
- [Azure OpenAI in Microsoft Foundry Models REST API reference](https://learn.microsoft.com/en-us/azure/foundry/openai/reference) — `api-key` header vs Bearer (HIGH)
- [Azure OpenAI v1 API compatibility notes](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle) — OpenAI-client compatibility, `baseURL` override (HIGH)
- [XML vs Markdown for high performance tasks — OpenAI Developer Community](https://community.openai.com/t/xml-vs-markdown-for-high-performance-tasks/1260014) — empirical adherence comparison (MEDIUM)
- [Best practices for prompt engineering — Claude](https://claude.com/blog/best-practices-for-prompt-engineering) — XML-tag delimiter rationale (HIGH)
- [SSO in Tab with Microsoft Entra ID](https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/authentication/tab-sso-overview) — Teams tab SSO flow (HIGH)
- [Best way to handle refusals in structured output responses?](https://community.openai.com/t/best-way-to-handle-refusals-in-structured-output-responses/1360710) — refusal field fallback pattern (MEDIUM)
- [A deep dive into OpenAI's Structured Outputs — Sophia Willows](https://sophiabits.com/blog/openai-structured-outputs-deep-dive) — refusal handling, schema key ordering (MEDIUM)
- [Grounding Enterprise AI with Live Web Retrieval and Verifiable Citations — Salesforce Engineering](https://engineering.salesforce.com/grounding-enterprise-ai-with-live-web-retrieval-and-verifiable-citations/) — verifiable-citation architecture patterns (MEDIUM)
- `C:\kbroles\info\KB_Assistant_ClaudeCode_Handover.md` — product spec, source-document metadata, suggested-prompt copy (HIGH, primary spec)
- `C:\kbroles\.planning\PROJECT.md` — active scope, constraints, key decisions (HIGH, primary spec)

---

*Architecture research for: enterprise role-aware, source-grounded AI chat assistant (stuff-the-context)*
*Researched: 2026-04-22*
