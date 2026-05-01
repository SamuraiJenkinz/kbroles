---
phase: quick-003
plan: 003
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/start.ps1
  - src/grounding/registry.ts
  - src/types/markdown.d.ts
  - scripts/md-loader.mjs
  - package.json
  - src/app/api/login/route.ts
  - src/app/api/login/__tests__/route.test.ts
autonomous: true

must_haves:
  truths:
    - "Task Scheduler launches start.ps1 → Node binds port 3001 → IIS reverse-proxies → app reachable; no premature exit"
    - "Production build runs on a host where the build-host absolute path does not exist; KB content loads without ENOENT"
    - "GET /api/login returns a 307 Location pointing at https://login.microsoftonline.com/... regardless of whether msal-node returns a path-only or absolute URL"
    - "pnpm smoke (tsx) still loads @/grounding/registry without a missing-loader crash"
    - "All existing unit tests pass; vitest run on src/grounding and src/app/api/login is green"
    - "Three atomic conventional-commit subjects land on master: fix(deploy)…, fix(grounding)…, fix(auth)…"
  artifacts:
    - path: "scripts/start.ps1"
      provides: "Task-Scheduler-safe launcher (Start-Process, no Tee pipe)"
      contains: "Start-Process"
    - path: "src/grounding/registry.ts"
      provides: "Build-time inlined KB markdown via static import (no runtime fs)"
      contains: "import kb0020882Raw from './sources/kb0020882.md'"
    - path: "src/types/markdown.d.ts"
      provides: "Ambient `declare module '*.md'` so TS accepts string-import of .md files"
      contains: "declare module '*.md'"
    - path: "scripts/md-loader.mjs"
      provides: "Node ESM loader that exposes .md file content as default-export string for tsx (pnpm smoke)"
      contains: "export async function load"
    - path: "src/app/api/login/route.ts"
      provides: "Defensive absolute-URL coercion before NextResponse.redirect"
      contains: "login.microsoftonline.com"
    - path: "src/app/api/login/__tests__/route.test.ts"
      provides: "Two new tests covering path-only and already-absolute MSAL return values"
      contains: "path-only"
  key_links:
    - from: "Task Scheduler action"
      to: "scripts/start.ps1"
      via: "powershell.exe -ExecutionPolicy Bypass -File"
      pattern: "Start-Process.*-PassThru"
    - from: "src/grounding/registry.ts"
      to: "src/grounding/sources/*.md"
      via: "static import → Webpack asset/source rule (next.config.ts) → Turbopack '*.md':{type:'raw'} → Vitest rawMarkdown plugin → tsx scripts/md-loader.mjs"
      pattern: "import .* from './sources/.*\\.md'"
    - from: "src/app/api/login/route.ts"
      to: "https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize"
      via: "NextResponse.redirect on an absolute URL"
      pattern: "/^https?:\\/\\//i"
---

<objective>
Convert three deployment-day workarounds into proper code fixes so the next deploy is clean.

Purpose: The pilot is currently up via three live workarounds (manual launch instead of Scheduled Task, hand-edited absolute paths, and a runtime URL patch). Each is a paper cut that will bite again on the next host or the next redeploy. This plan eliminates all three in atomic commits suitable to push to origin/master.

Output: Three commits, three conventional-commit subjects, all unit tests green, typecheck clean.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@scripts/start.ps1
@src/grounding/registry.ts
@src/app/api/login/route.ts
@src/app/api/login/__tests__/route.test.ts
@next.config.ts
@vitest.config.mts
@package.json
@scripts/phase0-smoke.ts
@.planning/phases/01-grounding-foundation/05-phase0-smoke-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite scripts/start.ps1 launcher to use Start-Process (Task-Scheduler safe)</name>
  <files>scripts/start.ps1</files>
  <action>
Replace ONLY the launch+wait section (current lines 64-66) of `scripts/start.ps1`. Leave all other content intact:
- Top-of-file comment block (purpose, usage, security notes) — preserve verbatim.
- `$ErrorActionPreference = 'Stop'` and the four `$EnvFile / $NodeExe / $ServerJs / $LogFile` variables.
- Env-file existence guard.
- Env-load loop and `Write-Host "[start.ps1] Loaded $count env vars from $EnvFile"`.

Add a new `$StderrLogFile` variable next to `$LogFile`:
```powershell
$LogFile       = 'D:\logs\kbassistant.log'
$StderrLogFile = 'D:\logs\kbassistant.err.log'
```
(Rationale: `Start-Process -RedirectStandardOutput X -RedirectStandardError X` errors with "Process must have standard output and error redirected to different files". Two files is the lowest-friction option; the operator already has D:\logs\ created with NetworkService write perms by `docs/deploy-windows.md` Step 3, so a second file requires no extra setup. Merging post-hoc would block the wrapper waiting on `Wait-Process` and add complexity for negligible operational gain — stderr is rare and worth its own file.)

Replace the final `& $NodeExe ... | Tee-Object ...` + `exit $LASTEXITCODE` block with:
```powershell
# ── Launch Node in a child process with both streams redirected to disk ──────
#
# WHY Start-Process (not `& $NodeExe ... | Tee-Object`):
#   The pipe form works under an interactive admin shell but silently breaks
#   when this script is launched non-interactively by Task Scheduler. With no
#   TTY, Tee-Object's pipe context causes Node to detect a closed stdin and
#   exit shortly after `Ready in 0ms` — port 3001 never binds, IIS then 502s.
#   Start-Process gives the Node child its own (detached) standard handles
#   wired directly to log files, so stdin closure no longer signals shutdown.
#   Quick task 003 (2026-04-29) — converts the deploy-day workaround into the
#   real fix. See .planning/quick/003-fix-pilot-deploy-workarounds-into-real-fixes/.
#
# Start-Process requires DIFFERENT files for stdout vs stderr (it errors out if
# the same path is given for both). Stdout is the operational log the operator
# tails; stderr captures unexpected Node-level failures (rare).
$proc = Start-Process `
    -FilePath $NodeExe `
    -ArgumentList @($ServerJs) `
    -NoNewWindow `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError $StderrLogFile `
    -PassThru

Wait-Process -InputObject $proc
exit $proc.ExitCode
```

Also update the top-of-file comment block to reference the new stderr log path. Add a single line under "Log path is hard-coded to D:\logs\kbassistant.log" reading:
```
#   - Stderr log path is hard-coded to D:\logs\kbassistant.err.log (created
#     alongside the stdout log; same icacls treatment).
```

DO NOT touch any env-loading logic, the env-file guard, or the existence/format of `D:\kbroles\.env.production`. Pure launcher rewrite.

Commit with conventional-commit subject (HEREDOC for multi-line body):
`fix(deploy): start.ps1 wrapper exits prematurely under Task Scheduler`

Body should reference the root cause (Tee-Object pipe → Node stdin EOF in non-TTY) and note that operators must ensure `D:\logs\kbassistant.err.log` is writable by the same identity that runs the Scheduled Task (NetworkService — already covered by Step 3's `icacls D:\logs` grant; no new operator action required).
  </action>
  <verify>
- Manual review of `scripts/start.ps1`: confirm Start-Process call uses backtick line continuations correctly, both stdout and stderr files differ, `-PassThru` is present, `Wait-Process -InputObject $proc` follows, and `exit $proc.ExitCode` is the last line.
- Confirm the top-of-file comment block now mentions the stderr log path.
- Confirm no other lines (env-file path, Node exe path, log file path, env-load loop) were changed.
- PowerShell parses on first invocation; an obvious typo (mismatched backtick, missing variable) would surface at runtime. There is no PowerShell linter wired into CI on this repo, so manual review is the gate.
- `git diff scripts/start.ps1` should show ONLY: the four-variable block expanded by one line ($StderrLogFile), the comment-block bullet for stderr log path, and the launch section rewritten. Nothing else.
- Run `git log -1 --pretty=format:'%s'` after the commit; subject MUST be `fix(deploy): start.ps1 wrapper exits prematurely under Task Scheduler`.
  </verify>
  <done>
- `scripts/start.ps1` uses `Start-Process -PassThru` + `Wait-Process` + `exit $proc.ExitCode`, with stdout → `D:\logs\kbassistant.log` and stderr → `D:\logs\kbassistant.err.log`.
- Top-of-file comment block documents both log paths and the bug being fixed.
- One commit on master with subject `fix(deploy): start.ps1 wrapper exits prematurely under Task Scheduler`.
- Operator can re-enable the Task Scheduler action without manual launch the next time the host reboots (functional verification deferred to next deploy window — not gateable on this machine).
  </done>
</task>

<task type="auto">
  <name>Task 2: Inline KB markdown at build time — revert registry.ts to static imports + add tsx loader</name>
  <files>src/grounding/registry.ts, src/types/markdown.d.ts, scripts/md-loader.mjs, package.json</files>
  <action>
**The bug.** Webpack constant-folds `import.meta.url` at build time into a build-host absolute file:// URL (e.g. `C:\\kbroles\\src\\grounding\\sources\\kb0020882.md`). At runtime on the deploy host, that path does not exist → ENOENT. Additionally, because the current code uses `readFileSync` (not a static import), Webpack's `asset/source` rule never fires and the .md files are NOT copied into the standalone trace at all (verified: `ls C:/kbroles/.next/standalone/src/grounding/sources/` → no such directory; `grep "kb0020882" .next/standalone/.next/server/chunks/*.js` → no match).

**The fix.** Revert to the original static-import pattern. Webpack's `asset/source` rule (next.config.ts:29) and Turbopack `'*.md': { type: 'raw' }` (next.config.ts:25) will then both inline the markdown content as string into the bundle at build time — no runtime fs, no host-specific paths, ENOENT-impossible.

**The constraint.** `scripts/phase0-smoke.ts` (line 27) imports `@/grounding/registry` and is run via `pnpm smoke` (`node --import tsx scripts/phase0-smoke.ts`). tsx (esbuild-based) has no built-in `.md` loader; reverting WITHOUT adding tsx support would re-break `pnpm smoke` (this is the regression the readFileSync workaround was originally introduced to fix — see .planning/phases/01-grounding-foundation/05-phase0-smoke-SUMMARY.md line 139).

**Strategy:** four small, coordinated changes in ONE commit so all three runtimes (Webpack, Turbopack, Vitest, tsx) load `.md` imports as raw strings:

1. **Rewrite `src/grounding/registry.ts`** — replace the readFileSync block with static imports:
   ```typescript
   import type { SourceId } from '@/grounding/schema'
   import kb0020882Raw from './sources/kb0020882.md'
   import kb0022991Raw from './sources/kb0022991.md'
   import snowFormRaw from './sources/servicenow-form.md'

   export type { SourceId } from '@/grounding/schema'
   ```
   Replace the comment block at the top (lines 4-9) with a new block explaining: `.md` files are loaded as raw strings at build time. Webpack's `asset/source` rule and Turbopack's `{ type: 'raw' }` rule (both in `next.config.ts`) handle the Next.js bundles. Vitest uses the `rawMarkdown` plugin in `vitest.config.mts`. tsx uses the loader hook registered by `pnpm smoke` (`--import ./scripts/md-loader.mjs`). DO NOT remove the `import.meta.url`/`readFileSync` import either — both are gone in the new version.

   Keep everything else (`parseSource`, `REGISTRY`, sanity checks) byte-identical.

2. **Create `src/types/markdown.d.ts`**:
   ```typescript
   // Ambient module declaration so TypeScript accepts `import x from './x.md'`
   // as a string. Webpack's `asset/source` rule, Turbopack's `'*.md':{type:'raw'}`
   // rule, Vitest's `rawMarkdown` plugin, and the tsx loader hook
   // (scripts/md-loader.mjs) all resolve such imports to the raw file contents
   // as the default export.
   declare module '*.md' {
     const content: string
     export default content
   }
   ```
   (Place under `src/types/` — a new directory. tsconfig.json's default `"include": ["src/**/*"]` will pick it up; verify by running `pnpm typecheck` after the change.)

3. **Create `scripts/md-loader.mjs`** — minimal Node ESM loader hook so tsx (and any other `node --import` invocation that uses it) treats `.md` imports as raw-string default exports:
   ```javascript
   // Node.js ESM custom loader: resolves `.md` imports to a default-exported
   // string of the file's UTF-8 contents. Used by `pnpm smoke` (which runs
   // scripts/phase0-smoke.ts via tsx, which doesn't have a built-in .md loader).
   //
   // Webpack/Turbopack/Vitest each handle `.md` imports independently in their
   // own configs — this loader covers ONLY the Node-via-tsx path.
   //
   // See .planning/quick/003-fix-pilot-deploy-workarounds-into-real-fixes/.
   import { readFile } from 'node:fs/promises'
   import { fileURLToPath, pathToFileURL } from 'node:url'

   export async function load(url, context, nextLoad) {
     if (url.endsWith('.md')) {
       const filePath = fileURLToPath(url)
       const content = await readFile(filePath, 'utf-8')
       return {
         format: 'module',
         shortCircuit: true,
         source: `export default ${JSON.stringify(content)}`,
       }
     }
     return nextLoad(url, context)
   }

   export async function resolve(specifier, context, nextResolve) {
     if (specifier.endsWith('.md')) {
       // Use the default resolver to handle path aliases / relative paths,
       // then mark as a module so `load()` runs.
       const resolved = await nextResolve(specifier, context)
       return { ...resolved, format: 'module', shortCircuit: true }
     }
     return nextResolve(specifier, context)
   }
   ```

4. **Update `package.json` `smoke` script** to register the loader BEFORE tsx so import resolution sees the .md hook in time:
   ```json
   "smoke": "node --env-file-if-exists=.env.local --import ./scripts/md-loader.mjs --import tsx scripts/phase0-smoke.ts"
   ```
   (Order matters: --import flags execute in declaration order; the .md loader must register first so when tsx then loads phase0-smoke.ts → registry.ts → kb0020882.md, the .md import is already intercepted.)

NO new dependencies. No change to `next.config.ts`, `vitest.config.mts`, `tsconfig.json`. No change to the `.md` source content.

Commit with conventional-commit subject:
`fix(grounding): inline KB markdown at build time instead of runtime fs read`

Body should call out: webpack constant-folded `import.meta.url` to a build-host absolute path → ENOENT on deploy host. Static imports route through Webpack's `asset/source` rule (already configured) and inline content at build time, no runtime fs. tsx compatibility preserved via a tiny custom Node loader.
  </action>
  <verify>
- `pnpm typecheck` exits 0 (TS accepts `import x from '*.md'` via the new ambient declaration).
- `pnpm test -- src/grounding` is green — registry.test.ts, validator.test.ts, systemPrompt.test.ts, anchorIds.test.ts all pass against the new module shape.
- `pnpm test -- src/app/api/sources src/app/api/config src/ui` is green — these all import REGISTRY transitively.
- `pnpm smoke -- --mode=dev` does NOT crash with a missing `.md` loader; it should reach the env-validation stage (which will fail without LLM_API_KEY set, but that's a separate gate — ANY error other than "Cannot find module … .md" or unknown loader is acceptable here, since the smoke script's own env checks exit 2 on missing creds and that proves registry loaded successfully).
  - If LLM_API_KEY is set in `.env.local`, smoke should run further; either outcome (env-gate exit 2 OR partial-run exit) is acceptable. The MUST-NOT is a `.md` loader error.
- `git diff src/grounding/registry.ts` shows: import block changed (readFileSync gone, three new static imports), comment block rewritten, NOTHING else.
- After `pnpm build`, `grep "How to flag content for review" .next/standalone/.next/server/chunks/*.js` should match (proves markdown content is now inlined into the bundle). If `.next/standalone/` doesn't exist locally, `grep "How to flag content for review" .next/server/chunks/*.js` is the equivalent check.
- `git log -1 --pretty=format:'%s'` MUST be `fix(grounding): inline KB markdown at build time instead of runtime fs read`.
  </verify>
  <done>
- `src/grounding/registry.ts` uses static `.md` imports and contains no `readFileSync` / `import.meta.url`.
- `src/types/markdown.d.ts` declares the `*.md` ambient module.
- `scripts/md-loader.mjs` registers a `.md` → string default-export loader for Node ESM.
- `package.json`'s `smoke` script registers the .md loader before tsx.
- All four files land in ONE commit with subject `fix(grounding): inline KB markdown at build time instead of runtime fs read`.
- `pnpm typecheck` and `pnpm test -- src/grounding` are green.
- `pnpm smoke` no longer fails with a missing `.md` loader (env-gate exit 2 is acceptable; loader-crash is not).
- A subsequent `pnpm build` produces a standalone bundle with KB markdown inlined into chunks (no .md files needed at runtime).
  </done>
</task>

<task type="auto">
  <name>Task 3: Force absolute URL on /api/login redirect (msal-node 5.1.4 returns path-only)</name>
  <files>src/app/api/login/route.ts, src/app/api/login/__tests__/route.test.ts</files>
  <action>
**The bug.** msal-node 5.1.4's `cca.getAuthCodeUrl()` returns a path-only URL (`/<tenant>/oauth2/v2.0/authorize?...`) rather than the absolute `https://login.microsoftonline.com/<tenant>/...` the authority config implies. `NextResponse.redirect()` resolves a relative URL against the request's host, so the 307 Location header points at OUR app's host instead of Microsoft's, and users land on a 404 in our app instead of the Entra sign-in page. Verified by `curl -D - --max-redirs 0 https://<host>/api/login`.

**The fix.** Defensive absolute-URL coercion. If `getAuthCodeUrl` ever starts returning absolute URLs again (upstream fix), the coercion is a harmless no-op.

**Implementation in `src/app/api/login/route.ts`:** insert between line 39 (the `await cca.getAuthCodeUrl(...)` call) and line 41 (the `return NextResponse.redirect(authUrl)`):

```typescript
  // Defensive: msal-node 5.1.4 (and possibly other versions) returns a path-
  // only URL like '/<tenant>/oauth2/v2.0/authorize?...' from getAuthCodeUrl()
  // rather than the absolute 'https://login.microsoftonline.com/<tenant>/...'
  // the authority config implies. NextResponse.redirect resolves path-only
  // URLs against the request host, sending users to our 404 instead of Entra.
  // Force absolute by prepending the canonical login.microsoftonline.com host
  // when the URL doesn't already include a scheme. If upstream msal-node
  // starts returning absolute URLs again, this becomes a harmless no-op.
  // Quick task 003 (2026-04-29) — converts the deploy-day workaround into the
  // real fix. See .planning/quick/003-fix-pilot-deploy-workarounds-into-real-fixes/.
  const absoluteAuthUrl = /^https?:\/\//i.test(authUrl)
    ? authUrl
    : `https://login.microsoftonline.com${authUrl.startsWith('/') ? '' : '/'}${authUrl}`

  return NextResponse.redirect(absoluteAuthUrl)
```

Remove the original `return NextResponse.redirect(authUrl)` at line 41. Add a new "Pitfall N — msal-node path-only URL" entry to the JSDoc comment at the top of the file referencing this fix; the existing pitfall numbering goes 1, 3, 4, 12 — add a "Pitfall 13" entry to keep the convention.

**Tests in `src/app/api/login/__tests__/route.test.ts`:** keep the three existing tests untouched. Add two new test cases at the end of the `describe('GET /api/login')` block:

```typescript
  it('coerces a path-only MSAL response to an absolute login.microsoftonline.com URL (Pitfall 13 — msal-node 5.1.4)', async () => {
    getAuthCodeUrlSpy.mockResolvedValue(
      '/some-tenant/oauth2/v2.0/authorize?client_id=x',
    )
    const resp = await GET()
    expect(resp.status).toBe(307)
    expect(resp.headers.get('location')).toBe(
      'https://login.microsoftonline.com/some-tenant/oauth2/v2.0/authorize?client_id=x',
    )
  })

  it('passes an already-absolute MSAL response through unchanged', async () => {
    getAuthCodeUrlSpy.mockResolvedValue(
      'https://login.microsoftonline.com/some-tenant/oauth2/v2.0/authorize?client_id=x',
    )
    const resp = await GET()
    expect(resp.status).toBe(307)
    expect(resp.headers.get('location')).toBe(
      'https://login.microsoftonline.com/some-tenant/oauth2/v2.0/authorize?client_id=x',
    )
  })
```

Note that the existing first test case ("redirects to the Entra authorize URL built by msal-node") already covers the absolute-pass-through case, but the explicit pair above documents the contract symmetrically and makes the regression visible if someone later inverts the conditional.

NO new dependencies. No change to msalClient.ts, env.ts, or secrets.ts.

Commit with conventional-commit subject:
`fix(auth): force absolute URL on /api/login redirect (msal-node 5.1.4 returns path-only)`

Body: describe the symptom (curl 307 → wrong host), the upstream behaviour (msal-node returning a relative path), why this is defensive (no-op if upstream fixes it), and link to the quick-task directory.
  </action>
  <verify>
- `pnpm typecheck` exits 0.
- `pnpm test -- src/app/api/login` runs all 5 tests (3 original + 2 new) and reports them all green.
- `git diff src/app/api/login/route.ts` shows: new comment block + new `absoluteAuthUrl` const + redirect call updated; no other changes (no import changes, no env changes, no MSAL config changes).
- `git diff src/app/api/login/__tests__/route.test.ts` shows: only two `it(...)` blocks added at the end of the describe; no existing test mutated.
- `git log -1 --pretty=format:'%s'` MUST be `fix(auth): force absolute URL on /api/login redirect (msal-node 5.1.4 returns path-only)`.
- (Deferred to next deploy window, not gateable here): `curl -D - --max-redirs 0 https://<host>/api/login | grep -i ^Location` should show `Location: https://login.microsoftonline.com/...`.
  </verify>
  <done>
- `src/app/api/login/route.ts` defensively coerces path-only `authUrl` to an absolute `https://login.microsoftonline.com/...` before passing to `NextResponse.redirect`.
- `src/app/api/login/__tests__/route.test.ts` has two new tests covering the path-only and already-absolute MSAL responses.
- One commit on master with subject `fix(auth): force absolute URL on /api/login redirect (msal-node 5.1.4 returns path-only)`.
- All login tests green.
  </done>
</task>

</tasks>

<verification>
After all three tasks complete:
- `pnpm typecheck` exits 0.
- `pnpm test` exits 0 (all unit tests green; expect 730+ tests now that two new login tests exist).
- `git log --oneline -3` shows three new commits with the three conventional-commit subjects in order:
  1. `fix(deploy): start.ps1 wrapper exits prematurely under Task Scheduler`
  2. `fix(grounding): inline KB markdown at build time instead of runtime fs read`
  3. `fix(auth): force absolute URL on /api/login redirect (msal-node 5.1.4 returns path-only)`
  (Order can vary; what matters is all three present and atomic.)
- `git status` is clean.
- `pnpm smoke -- --mode=dev` reaches its own env-validation gate without a `.md` loader crash (env-gate exit 2 is acceptable evidence the loader works; LLM_API_KEY may not be set locally).
- A `pnpm build` succeeds and (sanity check) `grep "How to flag content for review" .next/server/chunks/*.js` matches at least once, proving KB markdown is now inlined into the bundle.

If any of the above fails, the failing task's commit must be amended (or, preferably per RULES.md, a follow-up commit on top) before considering this plan complete. Do NOT push to origin until all three commits land cleanly and all verification gates pass.
</verification>

<success_criteria>
- All three workarounds eliminated:
  - Task Scheduler will launch start.ps1 cleanly without manual interactive shell launch.
  - Production build inlines KB content; no host-specific absolute paths in the bundle, no ENOENT possible at runtime.
  - /api/login always 307s to the correct Microsoft host regardless of msal-node's return-shape quirk.
- Three atomic conventional-commit commits on master, each pushable independently.
- pnpm typecheck clean. pnpm test green. pnpm smoke does not crash on .md loader.
- No new runtime dependencies. No changes to next.config.ts, vitest.config.mts, .env.production, ROADMAP.md, or PROJECT.md.
- Operator can next deploy without applying any of the three workarounds.
</success_criteria>

<output>
After completion, append a row to STATE.md's "Quick Tasks Completed" table:

| 003 | Convert three pilot-day workarounds into real fixes: (a) start.ps1 uses Start-Process so Task Scheduler launches cleanly; (b) registry.ts reverts to static .md imports so Webpack inlines KB content at build time (with new tsx md-loader for `pnpm smoke`); (c) /api/login defensively coerces msal-node's path-only URL to absolute. 730+ unit tests green; typecheck clean; smoke loader fix verified. | 2026-04-29 | `<commit-sha-3>` | [003-fix-pilot-deploy-workarounds-into-real-fixes](./quick/003-fix-pilot-deploy-workarounds-into-real-fixes/) |

(The commit-sha-3 is the most recent of the three commits; alternatively list all three short SHAs separated by commas.)

Update the trailing "*Last activity*" line accordingly.

Do NOT touch ROADMAP.md or PROJECT.md.
</output>
