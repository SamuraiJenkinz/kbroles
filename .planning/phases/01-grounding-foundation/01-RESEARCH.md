# Phase 1: Grounding Foundation — Research

**Researched:** 2026-04-22
**Domain:** Source registry, citation schema, quote validator, dual-mode LLM client, Phase-0 smoke harness
**Confidence:** HIGH for items 1–7 below; MEDIUM for items 8–9 (MGTI-specific behaviour requires live confirmation in Phase-0 smoke tests); LOW for item 10 (entity regex — refined at implementation time against actual source text)

---

## What's already decided

All architectural choices for this phase are locked in `01-CONTEXT.md`. This file does NOT re-derive them; it fills in the HOW gaps that CONTEXT.md left open for planning to resolve.

Quick pointer map:
- Source registry shape, boundary-tag format, section anchor convention, typed `Source[]` → CONTEXT.md §1
- Citation schema (JSON Schema 7, verbatim) → CONTEXT.md §2
- Validator behaviour (strip-then-flip, whitespace-normalise, 280-char quote, case-sensitive) → CONTEXT.md §2
- Prompt composition layers → CONTEXT.md §3
- Env contract (`LLM_AUTH_MODE`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `NODE_EXTRA_CA_CERTS`) → CONTEXT.md §4
- Factory signature (`createLlmClient()` → `OpenAI`; `streamAnswer` facade) → CONTEXT.md §4
- Smoke script scope (five Phase-0 checks, Smoke 4 browser-only) → CONTEXT.md §4
- Entity allowlist extraction shipped here, consumed in Phase 2 → CONTEXT.md §1

Do not re-plan any of the above. The gaps below are the only open questions.

---

## Gap 1: Vitest setup for a Next.js 16 / pnpm project

**Confirmed by:** Next.js 16 official docs (version 16.2.4, last updated 2026-04-21).

**Stack facts:**
- STACK.md pins `vitest@^3.0.0`, `@vitejs/plugin-react@^5.0.0`, `vite-tsconfig-paths` (implied by the `@/` alias convention used throughout ARCHITECTURE.md)
- Next.js 16 official docs prescribe exactly this setup for App Router projects

**Recommended config (HIGH confidence):**

```ts
// vitest.config.mts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',    // grounding/* and llm/* are pure TS; no DOM needed
  },
})
```

`@vitejs/plugin-react` is NOT needed for Phase 1 — all Phase-1 test targets (`registry`, `schema`, `systemPrompt`, `validator`, `client`) are pure TypeScript functions. Add it in Phase 3 when React component tests arrive. This keeps Phase-1 test startup fast.

**`vite-tsconfig-paths`** resolves `@/` path aliases from `tsconfig.json` automatically — no manual `moduleNameMapper` required (the Jest-era pattern). This is the correct pnpm + Next.js 16 approach.

**devDependency installation:**
```bash
pnpm add -D vitest vite-tsconfig-paths
# Add @vitejs/plugin-react and jsdom in Phase 3
```

**Snapshot tests on pure functions (`systemPrompt.test.ts`):**
```ts
import { expect, test } from 'vitest'
import { composeSystemPrompt } from '@/grounding/systemPrompt'

test('consumer prompt snapshot', () => {
  expect(composeSystemPrompt('consumer')).toMatchSnapshot()
})
test('author prompt snapshot', () => {
  expect(composeSystemPrompt('author')).toMatchSnapshot()
})
```
Snapshot files land in `src/grounding/__tests__/__snapshots__/`. First run creates them; subsequent runs diff. `pnpm test -u` updates. Commit snapshot files alongside source.

**Mocking the registry for validator tests:**
```ts
// src/grounding/__tests__/validator.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Inline fixture — do NOT vi.mock the real REGISTRY module.
// Validator accepts registry as a parameter; pass a minimal fixture directly.
import { validateCitations } from '@/grounding/validator'
import type { Registry } from '@/grounding/registry'

const FIXTURE_REGISTRY: Registry = {
  KB0020882: {
    id: 'KB0020882', title: 'Test SOP', version: 'v9.0',
    url: 'https://example.com',
    sections: [{ id: 'test-section', title: 'Test', body: 'Click the Flag Article button to flag it.' }],
  },
  // ... add SNOW_FORM and KB0022991 stubs as needed per test case
} as any

// Tests pass the fixture directly — no module mocking needed.
it('strips fabricated quote', () => {
  const response = { can_answer: true, answer: 'Do X.', citations: [
    { source_id: 'KB0020882', section_id: 'test-section', quote: 'THIS DOES NOT APPEAR IN BODY' }
  ]}
  const result = validateCitations(response, FIXTURE_REGISTRY)
  expect(result.citations).toHaveLength(0)
  expect(result.can_answer).toBe(false)  // all stripped → flip
})
```

Injecting the registry as a parameter (rather than importing it as a singleton inside `validateCitations`) is the correct design. CONTEXT.md already defines `validateCitations(response, registry) → response` — this confirms the parameter injection pattern. No `vi.mock` needed for the validator suite.

**`client.test.ts` — mock the `openai` package:**
```ts
import { vi, it, expect } from 'vitest'

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation((opts) => ({ _opts: opts }))
}))

import { createLlmClient } from '@/llm/client'

it('bearer mode sets no api-key header', () => {
  process.env.LLM_AUTH_MODE = 'bearer'
  process.env.LLM_BASE_URL  = 'https://api.openai.com/v1'
  process.env.LLM_API_KEY   = 'sk-test'
  process.env.LLM_MODEL     = 'gpt-4o'
  const client = createLlmClient() as any
  expect(client._opts.defaultHeaders?.['api-key']).toBeUndefined()
  expect(client._opts.apiKey).toBe('sk-test')
})

it('api-key mode sets api-key header', () => {
  process.env.LLM_AUTH_MODE = 'api-key'
  process.env.LLM_API_KEY   = 'mgti-key'
  const client = createLlmClient() as any
  expect(client._opts.defaultHeaders?.['api-key']).toBe('mgti-key')
})
```

**Pitfall:** `vi.mock` calls are hoisted — import `createLlmClient` AFTER `vi.mock('openai', ...)` to avoid the ordering trap.

---

## Gap 2: `as const satisfies JSONSchema7` — import, type, SDK wire format

**The schema module pattern (CONTEXT.md §2) calls for `export const CITATION_SCHEMA = { ... } as const satisfies JSONSchema7`.**

**Where `JSONSchema7` comes from (HIGH confidence):**
The `openai` npm package (currently at v6.x, though ARCHITECTURE.md targets v4 patterns — see Gap 3) does NOT export `JSONSchema7`. The canonical source is `@types/json-schema`, which the `openai` package already depends on transitively. Import it directly:

```bash
pnpm add -D @types/json-schema
```

```ts
// src/grounding/schema.ts
import type { JSONSchema7 } from 'json-schema'

export const CITATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['can_answer', 'answer', 'citations'],
  properties: {
    can_answer: { type: 'boolean' },
    answer:     { type: 'string' },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['source_id', 'section_id', 'quote'],
        properties: {
          source_id:  { type: 'string', enum: ['KB0020882', 'KB0022991', 'SNOW_FORM'] },
          section_id: { type: 'string' },
          quote:      { type: 'string', maxLength: 280 },
        },
      },
    },
  },
} as const satisfies JSONSchema7
```

`as const` narrows the literal types (keeps `enum: ['KB0020882', ...]` as a tuple, not `string[]`). `satisfies JSONSchema7` type-checks the shape at compile time without widening. The TypeScript type of `CITATION_SCHEMA` stays narrowed to its literal shape — necessary for the `KbResponse` type derivation.

**Wire format through the `openai` SDK (HIGH confidence):**
```ts
// Inside streamAnswer (src/llm/client.ts or src/llm/stream.ts)
const completion = await openaiClient.chat.completions.create({
  model: env.LLM_MODEL,
  messages: [...],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'kb_response',
      strict: true,
      schema: CITATION_SCHEMA as Record<string, unknown>,
      // The openai SDK's schema parameter is typed as Record<string, unknown>
      // (or a compatible object type), not as JSONSchema7 — cast required.
    },
  },
  stream: true,
})
```

The SDK's internal type for `json_schema.schema` is a plain object (`Record<string, unknown>` or similar), NOT `JSONSchema7`. The `as const satisfies JSONSchema7` gives you compile-time correctness on the definition; the `as Record<string, unknown>` cast is needed at the call site. These are two separate concerns.

**`schema.test.ts` — verify the schema is valid JSON Schema 7:**
```ts
import { it, expect } from 'vitest'
import { CITATION_SCHEMA } from '@/grounding/schema'

it('schema has required top-level keys', () => {
  expect(CITATION_SCHEMA.type).toBe('object')
  expect(CITATION_SCHEMA.required).toContain('can_answer')
  expect(CITATION_SCHEMA.additionalProperties).toBe(false)
})

it('source_id enum is locked', () => {
  const items = (CITATION_SCHEMA.properties.citations as any).items
  expect(items.properties.source_id.enum).toEqual(['KB0020882', 'KB0022991', 'SNOW_FORM'])
})
```
Do NOT bring in an Ajv validator in the test — that's circular (using Ajv to test a schema that Ajv will later validate). Shape assertions are sufficient here.

---

## Gap 3: Dual-mode LLM client factory — exact `openai` SDK version and API

**CRITICAL finding — package version mismatch between STACK.md and the real ecosystem:**

STACK.md and ARCHITECTURE.md describe patterns from the `openai` npm package v4 era (the `new OpenAI({ baseURL, apiKey, defaultHeaders })` pattern). The current package version is **v6.34.0** (as of April 2026). The v4 `chat.completions.create` patterns still work (no breaking change to that call surface confirmed by web research), but the package version pin in `package.json` should be reviewed.

**The client factory CONTEXT.md describes (ARCHITECTURE.md §10 pattern) remains valid:**

```ts
// src/llm/client.ts
import OpenAI from 'openai'
import { env } from '@/config/env'

export function createLlmClient(): OpenAI {
  if (env.LLM_AUTH_MODE === 'api-key') {
    return new OpenAI({
      baseURL: env.LLM_BASE_URL,
      apiKey:  'placeholder',          // SDK requires non-empty string; ignored by MGTI
      defaultHeaders: { 'api-key': env.LLM_API_KEY },
    })
  }
  return new OpenAI({
    baseURL: env.LLM_BASE_URL,         // https://api.openai.com/v1
    apiKey:  env.LLM_API_KEY,          // sk-...
  })
}
```

**Why `apiKey: 'placeholder'` for api-key mode:**
The `openai` SDK throws if `apiKey` is empty or undefined. When hitting MGTI, the real auth is the `api-key` header in `defaultHeaders`, NOT the `Authorization: Bearer` header the SDK builds from `apiKey`. Passing `'placeholder'` satisfies the SDK constructor's guard without leaking a real key into the Bearer header.

**Confirmed pattern (MEDIUM confidence — from ARCHITECTURE.md §10 and openai-node issues):**
The `defaultHeaders` override takes precedence over the SDK's generated `Authorization: Bearer` header when hitting Azure-compatible endpoints that read `api-key` from headers. Confirmed by the Azure OpenAI documentation (which recommends `api-key` header for Azure OpenAI calls) and openai-node community threads.

**`LLM_BASE_URL` for MGTI prod — url suffix is a Phase-0 smoke question:**
CONTEXT.md §4 shows `https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/v1` as the expected suffix. The ARCHITECTURE.md note is that this must be confirmed by Smoke 1 — the `/v1` suffix may be `/openai`, `/coreapi/openai`, or `/coreapi/openai/v1`. The factory accepts the whole URL from env; no code change is needed when the suffix is confirmed, only the env var updates.

**`streamAnswer` facade for `response_format: json_schema` + strict-mode fallback:**
```ts
// src/llm/stream.ts (or inline in client.ts)
export async function streamAnswer(
  client: OpenAI,
  params: { systemPrompt: string; messages: ChatMessage[]; schema: object }
): Promise<KbResponse> {
  try {
    const completion = await client.chat.completions.create({
      model: env.LLM_MODEL,
      messages: [
        { role: 'system', content: params.systemPrompt },
        ...params.messages,
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'kb_response', strict: true, schema: params.schema as any },
      },
      stream: false,  // Phase 1: non-streaming, returns full JSON for validation
    })
    return JSON.parse(completion.choices[0].message.content ?? '{}') as KbResponse
  } catch (err: unknown) {
    // Strict-mode fallback: if MGTI ignores strict, schema may be invalid JSON or
    // the response_format call may fail. Fall back to json_object + Ajv validation.
    // Implement and test the fallback path here; Phase-0 Smoke 2 determines which branch is live.
    throw err  // Surface to smoke script for now; Phase 2 adds production retry logic
  }
}
```

Note: Phase 1's `streamAnswer` is non-streaming (`stream: false`). Streaming (`stream: true` + SSE parsing) is a Phase 2 concern (GRND-07). The smoke script needs a synchronous response to assert the JSON shape — non-streaming is correct here.

---

## Gap 4: Markdown → typed registry parser

**Requirement:** Parse `src/grounding/sources/*.md` files (with `<source>` XML boundary and `<!-- section:ID -->` anchors) into `Source[]` at module load time. No runtime filesystem reads.

**Options evaluated:**

| Option | Verdict |
|--------|---------|
| `@next/mdx` or `remark` | Wrong shape — these compile MD to React components. We need raw string splitting. |
| Dedicated markdown parser library (`unified`, `micromark`) | Overkill — no need to understand MD syntax; we only need to split on comment anchors. |
| Build-time static import (webpack/turbopack raw) + hand-rolled regex parser | Correct. The parse logic is ~50 lines of TypeScript. |
| Runtime `fs.readFileSync` | Explicitly rejected by CONTEXT.md §1 ("no runtime filesystem reads"). |

**Recommendation:** Static import with hand-rolled regex parser (HIGH confidence).

**Step 1 — Import `.md` as raw string strings:**

Turbopack (Next.js 16 default) supports `type: 'raw'` module type natively, which returns file contents as a string. Add to `next.config.ts`:

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.md': { type: 'raw' },    // returns file contents as a string module
    },
  },
  webpack(config) {
    // Fallback for `next build --webpack` or CI without Turbopack:
    config.module.rules.push({ test: /\.md$/, type: 'asset/source' })
    return config
  },
}

export default nextConfig
```

`type: 'raw'` in Turbopack is the direct equivalent of webpack's `type: 'asset/source'`. Both return the file contents as a string. This is confirmed by the official Next.js 16 Turbopack documentation (version 16.2.4).

**TypeScript declaration** — needed so `import source from './kb0020882.md'` is typed as `string`:
```ts
// src/grounding/sources/md.d.ts  (or in the project root types.d.ts)
declare module '*.md' {
  const content: string
  export default content
}
```

**Step 2 — Parse the raw string:**
```ts
// src/grounding/registry.ts  (excerpt — actual shape per CONTEXT.md §1)
import kb0020882Raw from './sources/kb0020882.md'
import kb0022991Raw from './sources/kb0022991.md'
import snowFormRaw  from './sources/servicenow-form.md'

function parseSource(raw: string): Source {
  // 1. Extract <source> tag attributes
  const tagMatch = raw.match(/<source\s+id="([^"]+)"\s+title="([^"]+)"\s+version="([^"]+)"\s+url="([^"]+)"/)
  if (!tagMatch) throw new Error(`Missing <source> tag in registry file`)
  const [, id, title, version, url] = tagMatch

  // 2. Strip outer <source>…</source> wrapper; keep inner markdown
  const inner = raw.replace(/^[\s\S]*?<source[^>]*>/, '').replace(/<\/source>[\s\S]*$/, '')

  // 3. Split on <!-- section:ID --> markers
  const sectionPattern = /<!--\s*section:([\w-]+)\s*-->\s*\n([\s\S]*?)(?=<!--\s*section:|$)/g
  const sections: Section[] = []
  let m: RegExpExecArray | null
  while ((m = sectionPattern.exec(inner)) !== null) {
    const sectionId = m[1]
    const body = m[2].trim()
    // Extract title from first heading line
    const headingMatch = body.match(/^##\s+(.+)/)
    const sectionTitle = headingMatch ? headingMatch[1].trim() : sectionId
    sections.push({ id: sectionId, title: sectionTitle, body })
  }

  return { id: id as SourceId, title, version, url, sections }
}
```

**Pitfall:** The `sectionPattern` regex is greedy-ish via the lazy `[\s\S]*?` lookahead — it stops at the next `<!-- section:` anchor or end of string. Test it against multiline section bodies with blank lines. The pattern is correct for the described format; verify against the actual source files at authoring time.

**Whitespace normalisation in the parser:** Section `body` is stored as-is (original whitespace preserved). Whitespace normalisation (collapse runs to single space) is applied in the validator at match time, NOT at parse time. This preserves the source text for `renderSources` fidelity.

---

## Gap 5: Quote-substring validator algorithm

**Defined in CONTEXT.md §2:** verbatim substring match, whitespace normalisation only (both sides), case-sensitive, no punctuation normalisation. Here is the exact implementation:

```ts
function normalise(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function quoteExistsInBody(quote: string, body: string): boolean {
  return normalise(body).includes(normalise(quote))
}
```

**Why `.includes()` is sufficient (HIGH confidence):**
The validator's purpose is to block quotes that are NOT in the source text. `.includes()` is an O(n×m) substring check — entirely adequate for sections up to ~2000 characters and quotes up to 280 characters. A longest-common-substring algorithm would be wrong here (it would allow partial matches of paraphrases, violating the grounding contract). The 280-char cap on `quote` (enforced by the JSON schema `maxLength`) prevents pathological inputs.

**The 280-char cap interaction:** The cap is enforced at the LLM-response level by the JSON schema. The validator sees quotes that are already ≤280 chars. No length guard needed inside `quoteExistsInBody`. If a quote is exactly 280 chars, `.includes()` still works correctly against bodies of arbitrary length.

**Case-sensitivity (confirmed):** CONTEXT.md §2 explicitly states "Case-sensitive. No punctuation normalisation." This is intentional — if the model capitalises a word differently from the source, it is citing from memory, not from the text. The deterministic strictness is a feature.

**Edge cases tested in `validator.test.ts`:**
1. Quote with `\n` in model output → normalises to space → matches source body where same text appears on a single line
2. Quote with trailing/leading spaces → normalised away → matches
3. Quote with internal tab characters → normalised to space → matches
4. Quote with two spaces in model output → normalised to one → matches
5. Quote that differs only by capitalisation → FAILS (case-sensitive) → citation stripped → correct
6. Quote that is a paraphrase (same meaning, different words) → FAILS (not a substring) → citation stripped → correct

---

## Gap 6: Phase-0 smoke test harness

**Resolved in CONTEXT.md §4 — structure is fully specified.** The remaining HOW questions are below.

**`tsx` as the script runner (HIGH confidence):**
`tsx` (TypeScript Execute, npm package `tsx`) is the correct runner for `scripts/phase0-smoke.ts`. It uses esbuild under the hood, requires no tsconfig configuration beyond the project root, and respects `NODE_EXTRA_CA_CERTS` at runtime because it runs in Node — not a transpile-only step. It is faster and simpler than `ts-node`.

```json
// package.json
{
  "scripts": {
    "smoke": "tsx scripts/phase0-smoke.ts"
  },
  "devDependencies": {
    "tsx": "^4.0.0"
  }
}
```

Run: `pnpm smoke -- --mode=dev` or `pnpm smoke -- --mode=prod`.

**Detecting streaming chunk cadence (Smoke 3):**
```ts
// Measure chunk arrival times from the openai stream
const times: number[] = []
const stream = await client.chat.completions.create({
  model: env.LLM_MODEL,
  messages: [...],
  response_format: { type: 'json_schema', json_schema: { name: 'kb_response', strict: true, schema } },
  stream: true,
  max_tokens: 600,  // force a longer response so chunk count > 10
})

let prev = Date.now()
for await (const chunk of stream) {
  times.push(Date.now() - prev)
  prev = Date.now()
}

const sorted = [...times].sort((a, b) => a - b)
const p95 = sorted[Math.floor(sorted.length * 0.95)]
const chunkCount = times.length

console.log(`Chunk count: ${chunkCount}, P95 inter-chunk: ${p95}ms`)
if (p95 >= 500) console.warn('FAIL: P95 inter-chunk >= 500ms — APIM likely buffering')
if (chunkCount < 10) console.warn('FAIL: < 10 chunks on a ~500-token response — possible buffering')
```

PASS criteria (from CONTEXT.md §4): P95 inter-chunk < 500ms AND chunk count > 10. These are the thresholds already documented — no new research needed.

**First-chunk latency:** Log `times[0]` separately as `first_chunk_latency`. If it is >5s while subsequent chunks are fast, the delay is model-side (first token), not APIM buffering. Different remediation (none — model latency is expected).

**Five-check summary format in `docs/phase-0-smoke.md`:**
Each section: header `## Smoke N: <title>`, then `**Result:** PASS | FAIL`, date, operator, evidence (logs or screenshot filename), and remediation steps. This is already fully specified in CONTEXT.md §4 — the planner need not design it from scratch.

---

## Gap 7: Entity allowlist extraction

**Defined in CONTEXT.md §1:** extract `ENTITY_ALLOWLIST = { names: Set<string>, kbIds: Set<string>, urls: Set<string> }` by scanning source bodies.

**Regex recommendation (MEDIUM confidence — needs validation against actual source text):**

```ts
const NAME_RE   = /\b([A-Z][a-z]+(?:-[A-Z][a-z]+)?\s+[A-Z][a-z]+(?:-[A-Z][a-z]+)?)\b/g
const KB_ID_RE  = /\bKB\d{7}\b/g
const URL_RE    = /https?:\/\/[^\s<>"']+/g
```

**Hyphenated names:** The pattern `[A-Z][a-z]+(?:-[A-Z][a-z]+)?` handles `Smith-Jones` or `Lloyd-Atkinson` as part of a first or last name component. Sufficient for the MMC approver list (which is derived from the SOP content, not general NLP).

**False positive risk — "Short Description", "Knowledge Base", etc.:** Title-case noun phrases appear frequently in SOP text. This is acceptable for the allowlist extraction use case: the allowlist is permissive (contains MORE names than necessary), and the purpose is to catch hallucinated names NOT in the sources — not to enumerate exactly who is authorised. A false positive on "Short Description" being extracted as a name is benign (the model is unlikely to cite "Short Description" as an approver). A false negative (missing a real approver name) would be catastrophic — so err on the side of inclusion.

**CONTEXT.md §1 ("Claude's Discretion")** specifically calls out that exact edge-case regex tuning happens at implementation time against the actual source text. The planner should schedule one implementation task specifically for "run extraction against the three source files, review the extracted sets against the PROJECT.md approver list, adjust regex if any approver is missed."

**Simple is correct here.** NLP tokenizers (spaCy, compromise) are not needed and would be a new dependency for a 30-line function. The regex set is well-matched to the closed-world problem (three known documents).

---

## Gap 8: Packaging of markdown source files at build time — Next.js 16 / Turbopack

**Fully resolved by the Turbopack research in Gap 4.** Summary:

| Build tool | Mechanism | Config |
|------------|-----------|--------|
| Turbopack (Next.js 16 default `next dev` and `next build`) | `type: 'raw'` module type | `turbopack: { rules: { '*.md': { type: 'raw' } } }` in `next.config.ts` |
| Webpack fallback (explicit `--webpack` flag) | `asset/source` module type | `config.module.rules.push({ test: /\.md$/, type: 'asset/source' })` |

Both produce identical behaviour: `import content from './kb0020882.md'` gives `content: string` containing the full file text.

**`raw-loader` is deprecated** (webpack 4 era) — do not use it. `asset/source` (webpack 5) and `type: 'raw'` (Turbopack) are the current equivalents.

**Note: only loaders that return JavaScript code are supported by Turbopack.** `type: 'raw'` is a module type (not a loader), so this restriction does not apply — it is natively supported.

**Vitest raw string import:** The `vitest.config.mts` with `vite-tsconfig-paths` does not automatically pick up Next.js webpack/Turbopack rules. For Vitest, add:
```ts
// vitest.config.mts
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { environment: 'node' },
  assetsInclude: ['**/*.md'],    // treat .md as asset
})
```
With `assetsInclude`, Vitest returns the raw string for `.md` imports, matching the build-time behaviour.

---

## Gap 9: Corporate CA chain for outbound HTTPS

**Resolved in CONTEXT.md §4 — this is a zero-code environment variable concern.**

`NODE_EXTRA_CA_CERTS` is the standard Node.js mechanism for appending additional CA certificates to the trust store. It is set to an absolute path to a PEM-format certificate bundle file. Node.js reads it at startup and adds the certificates to the TLS trust store for all outbound HTTPS connections, including those made by the `openai` SDK.

**Confirmation (HIGH confidence):** Node.js official documentation ("Enterprise Network Configuration") confirms this mechanism. Azure App Service (Linux) supports passing environment variables via Application Settings, which means the CA bundle file must be present on the filesystem of the App Service instance at the configured path — typically a Secret or mounted volume. CONTEXT.md §4 documents the remediation: "Bundle itself is managed out-of-band (MMC platform team provides; App Service config points at the mounted path)."

**Dev impact:** On a developer laptop connecting to MGTI from outside MMC network, `NODE_EXTRA_CA_CERTS` must point to a locally-installed copy of the MMC corporate CA bundle. Without it, `openai.chat.completions.create` throws `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. The smoke script (Smoke 5) catches this condition explicitly.

**Known limitation:** `NODE_EXTRA_CA_CERTS` does NOT work when set in a `.env` file loaded by Next.js at runtime — it must be present in the process environment BEFORE Node.js starts (it is read at TLS module initialisation). Set it via shell export, App Service Application Settings, or Docker ENV, not via `dotenv` or Next.js env loading. This is a known Node.js limitation (nodejs/node issue #51426).

**Action for planner:** The `.env.example` file should document this with an explicit comment: `# NODE_EXTRA_CA_CERTS must be set in shell or App Service settings, NOT in .env files`.

---

## Gap 10: `brk-multihub://` consent / Entra SPA bits — Phase 1 scope?

**Resolution: fully deferred. Nothing in Phase 1 touches auth.**

CONTEXT.md §4 explicitly classifies Smoke 4 (Entra SPA + `brk-multihub://` consent) as "NOT exercised by this script — requires a browser" and as a manual checklist item. The Entra app registration, the `brk-multihub://` redirect URI, and all MSAL client code belong to Phase 5 (SSO & Teams Delivery).

Phase 1's only auth-related action is:
- Document the Smoke 4 manual checklist in `docs/phase-0-smoke.md` (Smoke 4 section)
- Identify the MMC Entra admin contact (a human task, not a code task)
- Confirm with the Entra admin that the `brk-multihub://` redirect URI type can be registered for the tenant

No code, no package, no TypeScript. The planner should create a task to "gather Entra admin contact + confirm tenant policy on brk-multihub:// URIs" as a non-blocking parallel task during Phase 1.

---

## Risks the planner should consider

### Risk 1: `openai` package version (MEDIUM)
STACK.md specifies `^4.x` but the current package is v6.34.0. The `chat.completions.create` + `response_format: json_schema` API appears stable across versions, but:
- The constructor signature (`new OpenAI({ baseURL, apiKey, defaultHeaders })`) should be verified against the installed version at project setup time.
- Pinning `openai@^4.0.0` installs an old package; the planner should decide: use the latest v6 (and verify the patterns above), or explicitly pin v4 for API stability. Recommend: **accept v6, verify the constructor pattern against the v6 type definitions before writing client code.** The `defaultHeaders` override for api-key auth is a stable pattern.

### Risk 2: MGTI strict-mode support (HIGH — blocks Smoke 2)
If the MGTI deployment does not honour `response_format: { type: 'json_schema', strict: true }` — either returning a 400 or silently ignoring the schema — the `streamAnswer` fallback to `json_object` + Ajv must be implemented. CONTEXT.md §2 describes this path. The planner must allocate a fallback implementation task that is gated on Smoke 2's result, not blocked by it. Both branches (strict mode and json_object fallback) should be implemented in Phase 1, with an env flag or capability probe determining which runs at runtime.

### Risk 3: Turbopack `*.md` raw type may not apply to Vitest (MEDIUM)
Turbopack's `type: 'raw'` is a Next.js/Turbopack concern, not a Vite/Vitest concern. If Vitest's `assetsInclude` is not configured, registry tests importing `.md` files will fail. This must be addressed in `vitest.config.mts` before the first registry test is run.

### Risk 4: Regex parser against multi-line XML attributes (LOW-MEDIUM)
The `<source>` tag attribute regex in Gap 4 assumes attributes are on a single line. If the source markdown files are authored with newlines inside the opening `<source>` tag, the match will fail silently. Mitigation: specify in the source-authoring task that the `<source>` opening tag must be a single line. Add a test assertion that all three sources parse successfully.

### Risk 5: `NODE_EXTRA_CA_CERTS` env loading order (HIGH for prod smoke)
As documented in Gap 9, this variable must be in the shell environment before Node starts — not in `.env`. If the smoke script is run via `pnpm smoke` with the variable in `.env.local`, it will fail with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. The smoke documentation must be explicit about this.

---

## Open Questions

Items that cannot be resolved without live systems — must be smoke-tested, not coded around:

1. **MGTI `baseURL` exact suffix** — is the path `/coreapi/openai/v1`, `/coreapi/openai`, or something else? Determines `LLM_BASE_URL` prod value. Smoke 1. BLOCKS all MGTI testing.

2. **MGTI `json_schema` strict-mode support** — does the deployment accept `response_format: { type: 'json_schema', strict: true }` without error? If not, which error code? Smoke 2. Determines whether the fallback path is needed at all.

3. **MGTI streaming chunk cadence** — does the APIM buffer responses? Smoke 3. Does not block Phase 1 completion (streaming is Phase 2), but the measurement must be documented before Phase 2 is planned.

4. **MMC corporate CA bundle path on App Service** — what is the PEM file location on the provisioned App Service? Does it need to be manually uploaded, or does the MMC platform team mount it automatically? Required before Smoke 5 in prod mode.

5. **Entra admin for `brk-multihub://` URI** — who to contact, and will the tenant allow it? Not needed until Phase 5, but should be identified during Phase 1 to avoid a surprise blocker at Phase 5 planning.

6. **`openai` package v4 vs v6 constructor type compatibility** — does `new OpenAI({ baseURL, apiKey, defaultHeaders })` in v6 still accept the same options? Verify by running `npx tsc --noEmit` after installing the package. If the types differ, adjust the factory pattern.

---

## Sources

### Primary (HIGH confidence)
- [Next.js 16 Vitest setup guide](https://nextjs.org/docs/app/guides/testing/vitest) — version 16.2.4, last updated 2026-04-21; vitest.config.mts pattern, vite-tsconfig-paths, pnpm install commands
- [Next.js 16 Turbopack config docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack) — version 16.2.4, last updated 2026-04-21; `type: 'raw'` module type, `raw-loader` deprecation, webpack fallback `asset/source`
- [Node.js Enterprise Network Configuration](https://nodejs.org/learn/http/enterprise-network-configuration) — `NODE_EXTRA_CA_CERTS` mechanism and env-loading caveat
- [Vitest snapshot docs](https://vitest.dev/guide/snapshot) — `toMatchSnapshot()` for pure TypeScript functions
- [Vitest mocking docs](https://vitest.dev/guide/mocking) — `vi.mock` hoisting, module mocking patterns
- `01-CONTEXT.md` — all locked decisions cited above

### Secondary (MEDIUM confidence)
- [openai-node GitHub releases](https://github.com/openai/openai-node/releases) — current package v6.34.0; v4 constructor patterns still compatible per no-breaking-change evidence
- [nodejs/node issue #51426](https://github.com/nodejs/node/issues/51426) — `NODE_EXTRA_CA_CERTS` not honoured from .env files
- Multiple openai community threads confirming `defaultHeaders` for `api-key` override pattern on Azure endpoints

### Tertiary (LOW confidence — confirm at implementation time)
- Entity regex patterns for name extraction — standard pattern, must be validated against the actual KB source files
- `openai` v6 exact constructor type compatibility — verify with `tsc --noEmit` at project setup

---

## Metadata

**Confidence breakdown:**
- Vitest setup: HIGH — official Next.js 16 docs, exact versions confirmed
- Raw MD import (Turbopack `type: 'raw'`): HIGH — official Next.js 16 Turbopack docs
- `as const satisfies JSONSchema7` import: HIGH — `@types/json-schema` is the standard source
- `openai` SDK constructor pattern: MEDIUM — v4 patterns confirmed, v6 compatibility inferred
- MGTI dual-mode auth: MEDIUM — pattern confirmed in ARCHITECTURE.md; live endpoint unconfirmed
- CA chain mechanism: HIGH — official Node.js docs
- Entity regex: LOW — standard pattern; must be validated against actual source files

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (stable ecosystem; MGTI-specific findings need live re-validation at Phase-0 smoke time)
