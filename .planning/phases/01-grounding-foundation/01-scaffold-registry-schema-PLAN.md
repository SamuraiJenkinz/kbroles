---
plan: 1
name: scaffold-registry-schema
phase: 1
wave: 1
depends_on: []
files_modified:
  - package.json
  - pnpm-lock.yaml
  - tsconfig.json
  - next.config.ts
  - vitest.config.mts
  - .env.example
  - .gitignore
  - types.d.ts
  - src/config/env.ts
  - src/grounding/schema.ts
  - src/grounding/registry.ts
  - src/grounding/entities.ts
  - src/grounding/sources/kb0020882.md
  - src/grounding/sources/kb0022991.md
  - src/grounding/sources/servicenow-form.md
  - src/grounding/__tests__/schema.test.ts
  - src/grounding/__tests__/registry.test.ts
  - src/grounding/__tests__/entities.test.ts
autonomous: true

must_haves:
  truths:
    - "pnpm install succeeds; pnpm tsc --noEmit passes; pnpm test passes the registry + schema + entities suites"
    - "Three source files exist at src/grounding/sources/{kb0020882,kb0022991,servicenow-form}.md as verbatim markdown inside a single-line <source> opening tag and </source> closing tag"
    - "Each source file contains at least one <!-- section:ID --> anchor per cite-able section, kebab-case IDs derived from the anchor (NOT the title)"
    - "registry.ts exports a typed Record<SourceId, Source> where SourceId = 'KB0020882' | 'KB0022991' | 'SNOW_FORM'; each Source has { id, title, version, url, sections: Section[] }; no runtime filesystem reads"
    - "schema.ts exports CITATION_SCHEMA typed `as const satisfies JSONSchema7` with source_id enum locked to the three SourceId values, quote maxLength 280, additionalProperties: false, required: [can_answer, answer, citations]"
    - "entities.ts exports ENTITY_ALLOWLIST = { names: Set<string>, kbIds: Set<string>, urls: Set<string> } derived from source bodies at module load"
    - "All seven publishing approver names from PROJECT.md (Richard Danilowicz, Samantha Eaton, Nicholas Hile, Matthew Renner, Julie Ramos, Brandon Young, Spencer Barratt) appear in ENTITY_ALLOWLIST.names"
    - "All three KB IDs (KB0020882, KB0022991, KB18801781) appear in ENTITY_ALLOWLIST.kbIds"
    - "env.ts Zod schema includes STRICT_SCHEMA_SUPPORTED as z.enum(['true','false']).optional().default('true'); .env.example documents the flag as commented-out with a link to Smoke 2 remediation"
  artifacts:
    - path: "package.json"
      provides: "Next.js 16, React 19.2, openai, vitest, tsx, zod, @types/json-schema dependencies; scripts for dev/build/test/typecheck/smoke"
    - path: "next.config.ts"
      provides: "Turbopack '*.md': { type: 'raw' } rule + webpack fallback type: 'asset/source'"
    - path: "vitest.config.mts"
      provides: "vite-tsconfig-paths plugin, environment: node, assetsInclude: ['**/*.md']"
    - path: "src/config/env.ts"
      provides: "zod-validated env object exporting LLM_AUTH_MODE, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, STRICT_SCHEMA_SUPPORTED"
    - path: "src/grounding/schema.ts"
      provides: "CITATION_SCHEMA constant typed as JSONSchema7; KbResponse TypeScript type"
      exports: ["CITATION_SCHEMA", "KbResponse", "Citation"]
    - path: "src/grounding/registry.ts"
      provides: "REGISTRY object, Source/Section/SourceId types, parseSource function"
      exports: ["REGISTRY", "Source", "Section", "SourceId", "Registry"]
    - path: "src/grounding/entities.ts"
      provides: "ENTITY_ALLOWLIST derived from registry source bodies"
      exports: ["ENTITY_ALLOWLIST"]
    - path: "src/grounding/sources/kb0020882.md"
      provides: "Verbatim KB0020882 v9.0 SOP text inside <source> tags with section anchors"
    - path: "src/grounding/sources/kb0022991.md"
      provides: "Verbatim KB0022991 v13.0 SOP text inside <source> tags with section anchors"
    - path: "src/grounding/sources/servicenow-form.md"
      provides: "ServiceNow Technical Knowledge form field map (derived from handover §5)"
  key_links:
    - from: "src/grounding/registry.ts"
      to: "src/grounding/sources/*.md"
      via: "static import ... from './sources/X.md' returning string"
      pattern: "import\\s+\\w+\\s+from\\s+'\\./sources/"
    - from: "src/grounding/entities.ts"
      to: "src/grounding/registry.ts"
      via: "imports REGISTRY, scans source bodies at module load"
      pattern: "import.*REGISTRY.*registry"
    - from: "src/grounding/schema.ts"
      to: "@types/json-schema"
      via: "import type JSONSchema7"
      pattern: "import type \\{ JSONSchema7 \\} from 'json-schema'"
---

<objective>
Scaffold the Next.js 16 + pnpm project and ship the pure grounding substrate: the three source markdown files, the registry loader that parses them into typed `Source[]`, the citation response JSON Schema, and the entity allowlist extractor. Nothing in this plan does network I/O. Every downstream plan in Phase 1 (validator, LLM client, system prompt, smoke script) imports from this plan's outputs. After this plan runs, `pnpm test` passes on the three test suites below and `pnpm tsc --noEmit` is clean.

Purpose: Establish the single source of truth for "what this assistant can say". The registry is the canonical representation; the schema is the canonical response contract; the entity allowlist is the post-check data used (in Phase 2) to block fabricated approver names and KB numbers.

Output: Working repo with typed registry, schema, entity allowlist, and passing unit tests.
</objective>

<context>
This plan is the foundation — NO other plans have shipped yet. Read the following before starting:

@.planning/phases/01-grounding-foundation/01-CONTEXT.md  (AUTHORITATIVE — all implementation decisions)
@.planning/phases/01-grounding-foundation/01-RESEARCH.md  (gap fillers — Vitest, Turbopack, JSONSchema7 import, entity regex)
@.planning/research/ARCHITECTURE.md  (sections §4.1, §4.2, §10, §16 — XML tag format, schema shape, build order)
@.planning/research/PITFALLS.md  (pitfalls #6 entity fabrication, #19 broken anchors)
@.planning/PROJECT.md  (stakeholders + approver names section for allowlist test)
@info/KB_Assistant_ClaudeCode_Handover.md  (§4 Source Documents, §5 ServiceNow form fields)

**Conflict note:** `.planning/research/STACK.md` prescribes `@ai-sdk/azure` + `ai-sdk/react`. CONTEXT.md overrides this — we use the raw `openai` npm package. STACK.md's frontend/testing/Next.js picks remain valid; only the LLM client layer differs.

**Conflict note:** ARCHITECTURE.md §4.2 shows `minItems: 0, maxItems: 3` on `citations` and no `maxLength` on `quote`. CONTEXT.md §2 drops the min/max on the array (GRND-04 is enforced by prompt + validator, not schema) and locks `maxLength: 280` on `quote`. Follow CONTEXT.md.

**Precedence:** CONTEXT.md > RESEARCH.md > ARCHITECTURE.md. When in doubt, CONTEXT.md wins.
</context>

<tasks>

<task id="1.1" type="auto" verify="pnpm --version && node --version">
  <name>Task 1.1: Verify environment prerequisites</name>
  <files>(none)</files>
  <action>
    Run `pnpm --version` and `node --version`. Node must be ≥ 20.9.0 (Next.js 16 minimum). pnpm must be installed. If either is missing, STOP and surface the error — do not attempt to install Node or pnpm automatically.

    Also check git is initialised: `git status` should succeed (repo is already initialised per planning context).
  </action>
  <verify>`pnpm --version` returns 8.x or 9.x; `node --version` returns v20.9.0 or higher; `git status` succeeds.</verify>
  <done>Environment confirmed. If any check fails, the plan is blocked and must be reported to the user.</done>
</task>

<task id="1.2" type="auto" verify="test -f package.json && test -f tsconfig.json && test -f next.config.ts">
  <name>Task 1.2: Scaffold Next.js 16 project with pnpm</name>
  <files>package.json, pnpm-lock.yaml, tsconfig.json, next.config.ts, .gitignore, types.d.ts</files>
  <action>
    Create `package.json` with this exact content (do NOT run `pnpm create next-app` — we want a minimal manual scaffold to avoid template sprawl):

    ```json
    {
      "name": "kb-knowledge-assistant",
      "version": "0.1.0",
      "private": true,
      "type": "module",
      "scripts": {
        "dev": "next dev",
        "build": "next build",
        "start": "next start",
        "lint": "next lint",
        "typecheck": "tsc --noEmit",
        "test": "vitest run",
        "test:watch": "vitest",
        "smoke": "tsx scripts/phase0-smoke.ts"
      },
      "dependencies": {
        "next": "^16.0.0",
        "react": "^19.2.0",
        "react-dom": "^19.2.0",
        "openai": "^6.0.0",
        "zod": "^4.0.0"
      },
      "devDependencies": {
        "typescript": "^5.6.0",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "@types/node": "^20.9.0",
        "@types/json-schema": "^7.0.15",
        "vitest": "^3.0.0",
        "vite-tsconfig-paths": "^5.0.0",
        "tsx": "^4.0.0",
        "ajv": "^8.0.0",
        "eslint": "^9.0.0",
        "eslint-config-next": "^16.0.0"
      }
    }
    ```

    Create `tsconfig.json`:

    ```json
    {
      "compilerOptions": {
        "target": "ES2022",
        "lib": ["dom", "dom.iterable", "esnext"],
        "allowJs": false,
        "skipLibCheck": true,
        "strict": true,
        "noEmit": true,
        "esModuleInterop": true,
        "module": "esnext",
        "moduleResolution": "bundler",
        "resolveJsonModule": true,
        "isolatedModules": true,
        "jsx": "preserve",
        "incremental": true,
        "plugins": [{ "name": "next" }],
        "paths": { "@/*": ["./src/*"] }
      },
      "include": ["next-env.d.ts", "types.d.ts", "src/**/*.ts", "src/**/*.tsx", "scripts/**/*.ts"],
      "exclude": ["node_modules"]
    }
    ```

    Create `next.config.ts` (Turbopack `type: 'raw'` is confirmed HIGH-confidence per RESEARCH.md Gap 4 & Gap 8 from the official Next.js 16.2.4 Turbopack docs — it is the direct equivalent of webpack's `asset/source`):

    ```ts
    import type { NextConfig } from 'next'

    const nextConfig: NextConfig = {
      turbopack: {
        rules: {
          // '*.md' files imported as raw string content. Equivalent to
          // webpack's `type: 'asset/source'` below. Do NOT use `loaders: []`
          // or `as: '*.ts'` here — that is not a valid Turbopack raw-import
          // rule and silently fails, returning undefined for `.md` imports.
          '*.md': { type: 'raw' },
        },
      },
      webpack(config) {
        config.module.rules.push({ test: /\.md$/, type: 'asset/source' })
        return config
      },
    }

    export default nextConfig
    ```

    Create `types.d.ts` at repo root:

    ```ts
    declare module '*.md' {
      const content: string
      export default content
    }
    ```

    Create `.gitignore`:

    ```
    node_modules
    .next
    .env
    .env.local
    .env.*.local
    *.log
    .DS_Store
    coverage
    .vitest-cache
    ```

    Then run `pnpm install`. This will install all deps and generate `pnpm-lock.yaml`.
  </action>
  <verify>
    - `test -f package.json` succeeds
    - `test -f tsconfig.json` succeeds
    - `test -f next.config.ts` succeeds
    - `test -f types.d.ts` succeeds
    - `pnpm install` exits 0
    - `pnpm tsc --noEmit` exits 0 (no TS errors at baseline — empty src/ is fine)
    - `grep -q "type: 'raw'" next.config.ts` succeeds (Turbopack rule sanity check)
  </verify>
  <done>Project scaffold present, deps installed, TypeScript compiles clean, Turbopack `*.md` rule uses `{ type: 'raw' }`.</done>
</task>

<task id="1.3" type="auto" verify="pnpm tsc --noEmit && pnpm vitest --version">
  <name>Task 1.3: Configure Vitest, env contract, .env.example</name>
  <files>vitest.config.mts, .env.example, src/config/env.ts</files>
  <action>
    Create `vitest.config.mts` at repo root:

    ```ts
    import { defineConfig } from 'vitest/config'
    import tsconfigPaths from 'vite-tsconfig-paths'

    export default defineConfig({
      plugins: [tsconfigPaths()],
      test: {
        environment: 'node',
        include: ['src/**/__tests__/**/*.test.ts', 'scripts/**/__tests__/**/*.test.ts'],
      },
      assetsInclude: ['**/*.md'],
    })
    ```

    Create `src/config/env.ts`:

    ```ts
    import { z } from 'zod'

    const EnvSchema = z.object({
      LLM_AUTH_MODE: z.enum(['bearer', 'api-key']),
      LLM_BASE_URL: z.string().url(),
      LLM_API_KEY: z.string().min(1),
      LLM_MODEL: z.string().min(1),
      // Strict-mode capability flag. Default 'true'. Set to 'false' only when
      // Smoke 2 remediation determines the MGTI deployment does NOT honour
      // response_format: { type: 'json_schema', strict: true }. This flag is
      // typed + validated here (not read raw via process.env) so typos like
      // 'flase', 'False', or '0' fail fast at loadEnv() instead of silently
      // leaving the fallback path inactive. See 01-CONTEXT.md §2/§4.
      STRICT_SCHEMA_SUPPORTED: z.enum(['true', 'false']).optional().default('true'),
    })

    export type Env = z.infer<typeof EnvSchema>

    let cached: Env | null = null

    export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
      const parsed = EnvSchema.safeParse(source)
      if (!parsed.success) {
        throw new Error(`Invalid env: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`)
      }
      return parsed.data
    }

    export function env(): Env {
      if (!cached) cached = loadEnv()
      return cached
    }

    // Reset for tests that mutate process.env
    export function __resetEnvCacheForTests(): void {
      cached = null
    }
    ```

    Create `.env.example`:

    ```
    # Local development (direct OpenAI)
    LLM_AUTH_MODE=bearer
    LLM_BASE_URL=https://api.openai.com/v1
    LLM_API_KEY=sk-replace-me
    LLM_MODEL=gpt-4o-2024-08-06

    # Production (MGTI ingress) — fill in via App Service Application Settings, NOT in .env files
    # LLM_AUTH_MODE=api-key
    # LLM_BASE_URL=https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/v1
    # LLM_API_KEY=<MGTI-issued key>
    # LLM_MODEL=<MGTI deployment name for gpt-4o>

    # Strict JSON Schema response-format capability flag. Default: true.
    # Set to 'false' ONLY if Phase-0 Smoke 2 determines the MGTI deployment
    # rejects response_format: { type: 'json_schema', strict: true } and the
    # json_object + Ajv fallback path must be used instead. See
    # .planning/phases/01-grounding-foundation/05-phase0-smoke-PLAN.md Smoke 2
    # remediation notes and 01-CONTEXT.md §2 strict-mode-fallback path.
    # STRICT_SCHEMA_SUPPORTED=true

    # NODE_EXTRA_CA_CERTS must be set in the SHELL ENVIRONMENT before Node starts (App Service App Settings,
    # Docker ENV, or export in shell). It does NOT work when read from .env files — Node reads it at TLS
    # init, before dotenv runs. See nodejs/node issue #51426.
    # NODE_EXTRA_CA_CERTS=/path/to/mmc-corporate-ca-bundle.pem
    ```
  </action>
  <verify>
    - `pnpm tsc --noEmit` exits 0
    - `pnpm vitest --version` returns ≥3.0.0
    - `.env.example` exists with the documented NODE_EXTRA_CA_CERTS caveat and the commented `STRICT_SCHEMA_SUPPORTED` block
    - `grep -q "STRICT_SCHEMA_SUPPORTED" src/config/env.ts` succeeds (Zod schema includes the flag)
    - `grep -q "STRICT_SCHEMA_SUPPORTED" .env.example` succeeds (documented)
  </verify>
  <done>Vitest config, env contract (including STRICT_SCHEMA_SUPPORTED), and .env.example in place. Nothing runs against live services yet.</done>
</task>

<task id="1.4" type="auto" verify="pnpm test -- src/grounding/__tests__/schema.test.ts">
  <name>Task 1.4: Write the citation response schema + tests</name>
  <files>src/grounding/schema.ts, src/grounding/__tests__/schema.test.ts</files>
  <action>
    Create `src/grounding/schema.ts`:

    ```ts
    import type { JSONSchema7 } from 'json-schema'

    // Locked per 01-CONTEXT.md §2. Do NOT add minItems/maxItems to citations
    // (GRND-04 ≤1-citation rule is enforced by prompt + validator, not schema).
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
              section_id: { type: 'string', description: 'Must match a <!-- section:ID --> anchor inside <sources>.' },
              quote:      { type: 'string', maxLength: 280 },
            },
          },
        },
      },
    } as const satisfies JSONSchema7

    // Narrowed TypeScript shape matching the JSON Schema
    export type SourceId = 'KB0020882' | 'KB0022991' | 'SNOW_FORM'
    export interface Citation {
      source_id: SourceId
      section_id: string
      quote: string
    }
    export interface KbResponse {
      can_answer: boolean
      answer: string
      citations: Citation[]
    }
    ```

    Create `src/grounding/__tests__/schema.test.ts`:

    ```ts
    import { it, expect } from 'vitest'
    import { CITATION_SCHEMA } from '@/grounding/schema'

    it('has the locked top-level shape', () => {
      expect(CITATION_SCHEMA.type).toBe('object')
      expect(CITATION_SCHEMA.additionalProperties).toBe(false)
      expect(CITATION_SCHEMA.required).toEqual(['can_answer', 'answer', 'citations'])
    })

    it('source_id enum is locked to the three SourceId values', () => {
      const items = (CITATION_SCHEMA.properties.citations as any).items
      expect(items.properties.source_id.enum).toEqual(['KB0020882', 'KB0022991', 'SNOW_FORM'])
    })

    it('quote field has maxLength 280', () => {
      const items = (CITATION_SCHEMA.properties.citations as any).items
      expect(items.properties.quote.maxLength).toBe(280)
    })

    it('citation objects have additionalProperties: false and all three required fields', () => {
      const items = (CITATION_SCHEMA.properties.citations as any).items
      expect(items.additionalProperties).toBe(false)
      expect(items.required).toEqual(['source_id', 'section_id', 'quote'])
    })
    ```

    Do NOT import Ajv into this test suite — validating a schema with the same library that will consume it at runtime is circular. Shape assertions are sufficient.
  </action>
  <verify>`pnpm test -- src/grounding/__tests__/schema.test.ts` passes all four cases.</verify>
  <done>Schema locked, tested, TypeScript types exported.</done>
</task>

<task id="1.5" type="auto" verify="test -f src/grounding/sources/kb0020882.md && test -f src/grounding/sources/kb0022991.md && test -f src/grounding/sources/servicenow-form.md">
  <name>Task 1.5: Author the three source markdown files</name>
  <files>src/grounding/sources/kb0020882.md, src/grounding/sources/kb0022991.md, src/grounding/sources/servicenow-form.md</files>
  <action>
    Create the three source files using content from `info/KB_Assistant_ClaudeCode_Handover.md` as the authoritative transcription (sections §4 Source Documents, §5 Form fields, §6 Naming, §7 Resolution, §8 Publishing, §9 Lifecycle, §10 Categorisation, §11 Flagging, §12 Knowledge Blocks, §13 Criteria Check).

    **Critical rules:**
    - **The opening `<source ...>` tag MUST be on a SINGLE LINE** (per RESEARCH.md Risk 4). The parser regex assumes this.
    - Each `<!-- section:ID -->` anchor ID is kebab-case, stable, derived from what the anchor IS, not the rendered heading (titles can change, IDs must not).
    - Every cite-able section gets its own anchor. Err on the side of FEWER, LARGER sections (a citation landing in a 200-line section is still actionable; a 3-line sub-sub-section tempts drift).
    - Section `##` heading on the line AFTER the anchor — the parser extracts the heading as `Section.title`.

    **File 1 — `src/grounding/sources/kb0020882.md`** (Submit New/Update Technical Knowledge Article SOP v9.0, author: Matthew Renner):

    ```
    <source id="KB0020882" title="Submit New/Update Technical Knowledge Article SOP" version="9.0" url="https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0020882">

    <!-- section:who-can-submit -->
    ## Who Can Submit

    [Transcribe handover §4 content for KB0020882 + §3 User Roles authoring eligibility. Keep the SOP voice.]

    <!-- section:article-creation-steps -->
    ## Article Creation Steps

    [Transcribe handover §4 KB0020882 article creation flow.]

    <!-- section:naming-convention -->
    ## Article Naming Convention

    [Transcribe handover §6 Naming Convention verbatim, including the 4-part format and 160-char limit.]

    <!-- section:required-fields -->
    ## Required Fields

    [Transcribe handover §5 ServiceNow Form Field Reference — the required subset.]

    <!-- section:resolution-field-software -->
    ## Resolution Field — Software (11-point)

    [Transcribe handover §7 Software 11-point checklist verbatim.]

    <!-- section:resolution-field-support-process -->
    ## Resolution Field — Support Process (7-point)

    [Transcribe handover §7 Support Process 7-point checklist verbatim.]

    <!-- section:security-rules -->
    ## Security Rules

    [Transcribe the no-passwords / no-external-download-links rules from §7.]

    <!-- section:attachments -->
    ## Attachments

    [Transcribe §5 Attachments guidance from the form fields reference.]

    <!-- section:categorisation -->
    ## Categorisation

    [Transcribe handover §10 Categorisation.]

    </source>
    ```

    **File 2 — `src/grounding/sources/kb0022991.md`** (Technical Knowledge Base Article Management SOP v13.0, author: Edmar Roseno):

    ```
    <source id="KB0022991" title="Technical Knowledge Base Article Management SOP" version="13.0" url="https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0022991">

    <!-- section:publishing-approval -->
    ## Publishing and Approval Workflow

    [Transcribe handover §8 Publishing & Approval Workflow verbatim — publish states, approver responsibilities.]

    <!-- section:approvers -->
    ## Publishing Approvers

    [Transcribe the named approver list: Richard Danilowicz, Samantha Eaton, Nicholas Hile, Matthew Renner, Julie Ramos, Brandon Young, Spencer Barratt. This must appear verbatim so the entity allowlist extractor (Task 1.7) catches every name.]

    <!-- section:edit-retire-delete -->
    ## Edit / Retire / Delete Lifecycle

    [Transcribe handover §9 verbatim.]

    <!-- section:flagging-articles -->
    ## Flagging Articles

    [Transcribe handover §11 Flagging Articles verbatim — this section is cited by the out-of-scope fallback.]

    <!-- section:knowledge-blocks -->
    ## Knowledge Blocks (Knowledge Team Only)

    [Transcribe handover §12.]

    <!-- section:criteria-check -->
    ## Colleague Knowledge Criteria Check

    [Transcribe handover §13.]

    </source>
    ```

    **File 3 — `src/grounding/sources/servicenow-form.md`** (ServiceNow Technical Knowledge Article Form — derived from handover §5, live version):

    ```
    <source id="SNOW_FORM" title="ServiceNow Technical Knowledge Article Form" version="live" url="https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB18801781">

    <!-- section:required-fields -->
    ## Required Fields

    [Transcribe handover §5 Required Fields subset: Knowledge Base, Category, Short description, Article body, etc.]

    <!-- section:short-description -->
    ## Short Description Field

    [Transcribe §5 Short description guidance + reference to §6 naming convention.]

    <!-- section:article-body -->
    ## Article Body Field

    [Transcribe §5 Article body field guidance.]

    <!-- section:resolution-field -->
    ## Resolution Field

    [Transcribe §5 Resolution field guidance; include structure expectations.]

    <!-- section:configuration-item -->
    ## Configuration Item Field

    [Transcribe §5 CI field guidance.]

    <!-- section:optional-fields -->
    ## Optional Fields

    [Transcribe §5 optional fields: meta, keywords, attachments metadata.]

    <!-- section:workflow-fields -->
    ## Workflow State Fields

    [Transcribe §5 workflow fields: valid from/to, retired, etc.]

    </source>
    ```

    **Section-anchor discretion (from CONTEXT.md "Claude's Discretion"):** Exact anchor IDs (e.g. `required-fields` vs `form-required-fields`) are chosen here. Two source files may both use `required-fields` — that's fine, `section_id` is scoped per `source_id` (the parser groups sections under their source). When parsing, the validator looks up `registry[source_id].sections.find(s => s.id === section_id)`, so the same section_id under different source_ids is unambiguous.

    **Transcription fidelity:** Use the handover document text verbatim where it exists. Where the handover paraphrases (e.g. "the SOP describes..."), write the SOP-voice equivalent that would plausibly appear in the real KB article. When in doubt, keep the prose short and factual — a citation quote is ≤280 chars, so long ornate prose only makes the registry heavier without helping.

    **Verify every source closes with `</source>` on its own line** and the opening `<source ...>` tag is on a single line (no newlines between attributes).
  </action>
  <verify>
    - All three files exist at the paths specified
    - `grep -c '<source ' src/grounding/sources/*.md` returns 1 for each
    - `grep -c '</source>' src/grounding/sources/*.md` returns 1 for each
    - `grep -c '<!-- section:' src/grounding/sources/kb0020882.md` returns ≥ 6
    - `grep -c '<!-- section:' src/grounding/sources/kb0022991.md` returns ≥ 5
    - `grep -c '<!-- section:' src/grounding/sources/servicenow-form.md` returns ≥ 4
    - Each opening `<source ...>` tag contains `id="..."`, `title="..."`, `version="..."`, `url="..."` on a single line
    - `grep -l "Richard Danilowicz" src/grounding/sources/kb0022991.md` finds it
  </verify>
  <done>Three source markdown files are authored verbatim with single-line `<source>` tags and kebab-case section anchors.</done>
</task>

<task id="1.6" type="auto" verify="pnpm test -- src/grounding/__tests__/registry.test.ts">
  <name>Task 1.6: Write the registry parser + tests</name>
  <files>src/grounding/registry.ts, src/grounding/__tests__/registry.test.ts</files>
  <action>
    Create `src/grounding/registry.ts`:

    ```ts
    import type { SourceId } from '@/grounding/schema'
    import kb0020882Raw from './sources/kb0020882.md'
    import kb0022991Raw from './sources/kb0022991.md'
    import snowFormRaw  from './sources/servicenow-form.md'

    export type { SourceId } from '@/grounding/schema'

    export interface Section {
      id: string
      title: string
      body: string
    }

    export interface Source {
      id: SourceId
      title: string
      version: string
      url: string
      sections: Section[]
    }

    export type Registry = Record<SourceId, Source>

    const SOURCE_TAG_RE =
      /<source\s+id="([^"]+)"\s+title="([^"]+)"\s+version="([^"]+)"\s+url="([^"]+)"\s*>/

    export function parseSource(raw: string): Source {
      // SECTION_RE is declared INSIDE parseSource (not at module scope).
      // A shared /g regex carries `lastIndex` between calls, which is safe for
      // sequential invocations but breaks under concurrent usage (e.g.
      // Promise.all([parseSource(a), parseSource(b)])) and surprises future
      // maintainers. Declaring it locally sidesteps both issues; the per-call
      // allocation cost is negligible (3 calls at module load + test calls).
      const SECTION_RE =
        /<!--\s*section:([\w-]+)\s*-->\s*\n([\s\S]*?)(?=<!--\s*section:|<\/source>|$)/g

      const tagMatch = raw.match(SOURCE_TAG_RE)
      if (!tagMatch) {
        throw new Error('Missing or malformed <source ...> opening tag (must be on single line)')
      }
      const [, id, title, version, url] = tagMatch

      // Strip wrapper
      const afterOpen = raw.replace(/^[\s\S]*?<source[^>]*>/, '')
      const inner = afterOpen.replace(/<\/source>[\s\S]*$/, '')

      const sections: Section[] = []
      let m: RegExpExecArray | null
      while ((m = SECTION_RE.exec(inner)) !== null) {
        const sectionId = m[1]
        const rawBody = m[2].trim()
        const headingMatch = rawBody.match(/^##\s+(.+)$/m)
        const sectionTitle = headingMatch ? headingMatch[1].trim() : sectionId
        sections.push({ id: sectionId, title: sectionTitle, body: rawBody })
      }

      if (sections.length === 0) {
        throw new Error(`Source ${id} has no <!-- section:ID --> anchors`)
      }

      return { id: id as SourceId, title, version, url, sections }
    }

    const kb0020882 = parseSource(kb0020882Raw)
    const kb0022991 = parseSource(kb0022991Raw)
    const snowForm  = parseSource(snowFormRaw)

    export const REGISTRY: Registry = {
      KB0020882: kb0020882,
      KB0022991: kb0022991,
      SNOW_FORM: snowForm,
    }

    // Sanity check at module load — fail fast if the raw files drift
    if (kb0020882.id !== 'KB0020882') throw new Error(`kb0020882.md has id=${kb0020882.id}`)
    if (kb0022991.id !== 'KB0022991') throw new Error(`kb0022991.md has id=${kb0022991.id}`)
    if (snowForm.id !== 'SNOW_FORM')  throw new Error(`servicenow-form.md has id=${snowForm.id}`)
    ```

    Create `src/grounding/__tests__/registry.test.ts`:

    ```ts
    import { describe, it, expect } from 'vitest'
    import { REGISTRY, parseSource } from '@/grounding/registry'

    describe('REGISTRY — module load', () => {
      it('has all three sources keyed by SourceId', () => {
        expect(REGISTRY.KB0020882).toBeDefined()
        expect(REGISTRY.KB0022991).toBeDefined()
        expect(REGISTRY.SNOW_FORM).toBeDefined()
      })

      it('each source has the expected metadata', () => {
        expect(REGISTRY.KB0020882.version).toBe('9.0')
        expect(REGISTRY.KB0022991.version).toBe('13.0')
        expect(REGISTRY.SNOW_FORM.version).toBe('live')
        expect(REGISTRY.KB0020882.url).toContain('KB0020882')
        expect(REGISTRY.KB0022991.url).toContain('KB0022991')
      })

      it('each source has at least one section', () => {
        expect(REGISTRY.KB0020882.sections.length).toBeGreaterThan(0)
        expect(REGISTRY.KB0022991.sections.length).toBeGreaterThan(0)
        expect(REGISTRY.SNOW_FORM.sections.length).toBeGreaterThan(0)
      })

      it('KB0022991 has the flagging-articles section (load-bearing for fallback)', () => {
        const flagging = REGISTRY.KB0022991.sections.find(s => s.id === 'flagging-articles')
        expect(flagging).toBeDefined()
        expect(flagging!.body.length).toBeGreaterThan(10)
      })

      it('every section has a non-empty body and a title', () => {
        for (const source of Object.values(REGISTRY)) {
          for (const section of source.sections) {
            expect(section.id).toMatch(/^[\w-]+$/)
            expect(section.title.length).toBeGreaterThan(0)
            expect(section.body.length).toBeGreaterThan(0)
          }
        }
      })
    })

    describe('parseSource — unit tests', () => {
      it('throws on missing <source> tag', () => {
        expect(() => parseSource('no tag here')).toThrow(/Missing or malformed/)
      })

      it('extracts a single section with kebab-case ID and ## heading title', () => {
        const raw = `<source id="KB0020882" title="Test" version="1.0" url="http://x">
    <!-- section:example-section -->
    ## Example Section

    Body text here.
    </source>`
        const src = parseSource(raw)
        expect(src.id).toBe('KB0020882')
        expect(src.sections).toHaveLength(1)
        expect(src.sections[0].id).toBe('example-section')
        expect(src.sections[0].title).toBe('Example Section')
        expect(src.sections[0].body).toContain('Body text here')
      })

      it('extracts multiple sections correctly', () => {
        const raw = `<source id="KB0022991" title="T" version="1" url="http://x">
    <!-- section:one -->
    ## One
    Body one.
    <!-- section:two -->
    ## Two
    Body two.
    </source>`
        const src = parseSource(raw)
        expect(src.sections).toHaveLength(2)
        expect(src.sections.map(s => s.id)).toEqual(['one', 'two'])
      })

      it('throws when source has zero section anchors', () => {
        const raw = `<source id="KB0020882" title="T" version="1" url="http://x">
    ## Heading with no anchor
    Body.
    </source>`
        expect(() => parseSource(raw)).toThrow(/no <!-- section:ID --> anchors/)
      })
    })
    ```
  </action>
  <verify>
    - `pnpm test -- src/grounding/__tests__/registry.test.ts` passes all cases
    - `pnpm tsc --noEmit` exits 0
  </verify>
  <done>Registry loads at module-init, parses all three source files, exports typed Record, all tests green.</done>
</task>

<task id="1.7" type="auto" verify="pnpm test -- src/grounding/__tests__/entities.test.ts">
  <name>Task 1.7: Build the entity allowlist extractor + tests</name>
  <files>src/grounding/entities.ts, src/grounding/__tests__/entities.test.ts</files>
  <action>
    Create `src/grounding/entities.ts`:

    ```ts
    import { REGISTRY } from '@/grounding/registry'

    // MEDIUM-confidence regex per RESEARCH.md Gap 7 / Risk for §1.
    // Permissive by design — false positives on title-case noun phrases are
    // acceptable (allowlist matches fail open — extra names are harmless).
    // False negatives (real approvers missed) would be catastrophic.
    const NAME_RE  = /\b([A-Z][a-z]+(?:-[A-Z][a-z]+)?\s+[A-Z][a-z]+(?:-[A-Z][a-z]+)?)\b/g
    const KB_ID_RE = /\bKB\d{7}\b/g
    const URL_RE   = /https?:\/\/[^\s<>"'\]]+/g

    export interface EntityAllowlist {
      names: Set<string>
      kbIds: Set<string>
      urls: Set<string>
    }

    function extract(): EntityAllowlist {
      const names = new Set<string>()
      const kbIds = new Set<string>()
      const urls  = new Set<string>()

      for (const source of Object.values(REGISTRY)) {
        kbIds.add(source.id.startsWith('KB') ? source.id : '')
        kbIds.delete('')
        urls.add(source.url)

        for (const section of source.sections) {
          const body = section.body
          for (const m of body.matchAll(NAME_RE))  names.add(m[1])
          for (const m of body.matchAll(KB_ID_RE)) kbIds.add(m[0])
          for (const m of body.matchAll(URL_RE))   urls.add(m[0])
        }
      }

      return { names, kbIds, urls }
    }

    export const ENTITY_ALLOWLIST: EntityAllowlist = extract()
    ```

    Create `src/grounding/__tests__/entities.test.ts`:

    ```ts
    import { describe, it, expect } from 'vitest'
    import { ENTITY_ALLOWLIST } from '@/grounding/entities'

    // PROJECT.md Context: "Publishing approvers (as referenced by the assistant):
    // Richard Danilowicz, Samantha Eaton, Nicholas Hile, Matthew Renner,
    // Julie Ramos, Brandon Young, Spencer Barratt."
    const APPROVERS = [
      'Richard Danilowicz',
      'Samantha Eaton',
      'Nicholas Hile',
      'Matthew Renner',
      'Julie Ramos',
      'Brandon Young',
      'Spencer Barratt',
    ]

    describe('ENTITY_ALLOWLIST', () => {
      it('is populated (non-empty)', () => {
        expect(ENTITY_ALLOWLIST.names.size).toBeGreaterThan(0)
        expect(ENTITY_ALLOWLIST.kbIds.size).toBeGreaterThan(0)
        expect(ENTITY_ALLOWLIST.urls.size).toBeGreaterThan(0)
      })

      it.each(APPROVERS)('contains approver %s', (name) => {
        expect(ENTITY_ALLOWLIST.names.has(name)).toBe(true)
      })

      it('contains all three KB IDs (KB0020882, KB0022991, KB18801781)', () => {
        expect(ENTITY_ALLOWLIST.kbIds.has('KB0020882')).toBe(true)
        expect(ENTITY_ALLOWLIST.kbIds.has('KB0022991')).toBe(true)
        expect(ENTITY_ALLOWLIST.kbIds.has('KB18801781')).toBe(true)
      })

      it('contains the ServiceNow permalink base for each source', () => {
        const hasPermalink = Array.from(ENTITY_ALLOWLIST.urls).some(u =>
          u.startsWith('https://mmcnow.service-now.com/kb_view.do')
        )
        expect(hasPermalink).toBe(true)
      })
    })
    ```

    **If any approver name fails to be extracted**, iterate the NAME_RE regex — CONTEXT.md "Claude's Discretion" specifically schedules this tuning for implementation time. Do not add names manually to a literal list; the allowlist must be derived from the source text at module load so it stays in lockstep with the registry.
  </action>
  <verify>
    - `pnpm test -- src/grounding/__tests__/entities.test.ts` passes all cases, including all seven approver names
    - If any approver test fails: adjust the regex OR adjust how the approver appears in `src/grounding/sources/kb0022991.md` (the `<!-- section:approvers -->` section specifically), then re-run.
  </verify>
  <done>Entity allowlist extraction works; all seven approvers and three KB IDs are present.</done>
</task>

<task id="1.8" type="auto" verify="pnpm test && pnpm tsc --noEmit">
  <name>Task 1.8: Full suite green + typecheck clean + commit</name>
  <files>(none — verification + git)</files>
  <action>
    Run the full test suite and typecheck. Both must pass cleanly.

    ```bash
    pnpm test
    pnpm tsc --noEmit
    ```

    Expected output: three test files (schema, registry, entities) all pass. TypeScript exits 0.

    If anything fails, FIX IT BEFORE COMMITTING. Do not leave broken tests.

    Commit (if all green):

    ```bash
    git add package.json pnpm-lock.yaml tsconfig.json next.config.ts vitest.config.mts .env.example .gitignore types.d.ts src/config src/grounding .planning/phases/01-grounding-foundation/01-scaffold-registry-schema-PLAN.md
    git commit -m "feat(phase-1/plan-01): scaffold Next.js + grounding substrate

    - Next.js 16 + React 19.2 scaffold with TypeScript strict, pnpm, Vitest
    - Three source markdown files (KB0020882 v9.0, KB0022991 v13.0, SNOW_FORM live)
      with XML boundary tags and kebab-case section anchors
    - registry.ts parses sources at module load (no runtime fs reads)
    - schema.ts locks CITATION_SCHEMA as JSONSchema7 + KbResponse type
    - entities.ts extracts ENTITY_ALLOWLIST (names, kbIds, urls) from source bodies
    - env.ts zod-validates LLM_AUTH_MODE/LLM_BASE_URL/LLM_API_KEY/LLM_MODEL +
      STRICT_SCHEMA_SUPPORTED (default 'true', documented in .env.example)
    - All three test suites green; tsc --noEmit clean

    GRND-01 (source text embedded), GRND-02 (citation schema),
    GRND-05 (single prompt template foundation), CORP-01 (source as files in repo).
    Allowlist extraction shipped here; consumed by Phase 2 CORP-02."
    ```
  </action>
  <verify>
    - `pnpm test` exits 0 with all three suites reporting pass
    - `pnpm tsc --noEmit` exits 0
    - `git log -1 --oneline` shows the Plan 01 commit
  </verify>
  <done>Full Plan 01 suite green, committed. Downstream plans (02–05) can now import from `@/grounding/*`.</done>
</task>

</tasks>

<verification>
Phase-level checks for this plan:

1. `pnpm test` — all three test files pass: schema.test.ts (4 cases), registry.test.ts (~8 cases), entities.test.ts (~11 cases including 7 approvers)
2. `pnpm tsc --noEmit` — exits 0, no type errors
3. `pnpm next lint` — optional; may fail on missing Next.js pages since we haven't made any. Skip if it complains about missing src/app; we'll address in Phase 3.
4. Visual inspection: `src/grounding/` directory contains `schema.ts`, `registry.ts`, `entities.ts`, `sources/{kb0020882,kb0022991,servicenow-form}.md`, `__tests__/{schema,registry,entities}.test.ts`
</verification>

<success_criteria>
- All must_haves above are observably true (pnpm test green, all files exist, typed shapes correct, allowlist contains approvers)
- `KbResponse`, `Citation`, `SourceId`, `Source`, `Section`, `Registry`, `REGISTRY`, `ENTITY_ALLOWLIST`, `CITATION_SCHEMA`, `env`, `loadEnv` are all exported and importable via `@/...` paths
- No network calls made during test run (validator/client/smoke come later)
- Commit is in git history
</success_criteria>

<out_of_scope>
- **Validator logic** (`validateCitations`) → Plan 02
- **LLM client factory** (`createLlmClient`, `streamAnswer`) → Plan 03
- **System prompt composer** (`composeSystemPrompt`) → Plan 04
- **Phase-0 smoke script** (`scripts/phase0-smoke.ts`) → Plan 05
- **Entity allowlist POST-CHECK** (running against real LLM responses) → Phase 2 (CORP-02)
- **Streaming (`stream: true` + SSE parsing)** → Phase 2 (GRND-07)
- **`/api/chat` route, any UI, any auth** → Phases 2–5
- **Ajv JSON Schema validator** → included as a devDep now (for Plan 03's json_object fallback path), but no validator code is written in this plan
</out_of_scope>

<pitfall_watch>
- **Pitfall 19 (broken anchors on re-embed):** Section IDs are derived from `<!-- section:ID -->` markers, not from heading titles. Marker IDs are stable; titles can drift. Registry test asserts `flagging-articles` specifically exists in KB0022991.
- **Pitfall 6 (fabricated approver names):** Entity allowlist EXTRACTION ships here. Test asserts all seven PROJECT.md approvers are present; any miss triggers regex tuning before commit.
- **RESEARCH Risk 4 (single-line `<source>` tag):** Parser regex requires single-line opening tag. Task 1.5 verification greps for `'<source '` with one occurrence per file.
- **RESEARCH Risk 3 (Vitest vs Turbopack `.md` imports):** `vitest.config.mts` includes `assetsInclude: ['**/*.md']` so Vitest returns raw string for `.md` imports — matches Turbopack/webpack behaviour.
</pitfall_watch>
