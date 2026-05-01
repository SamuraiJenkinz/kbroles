// Node.js ESM custom loader: resolves `.md` imports to a default-exported
// string of the file's UTF-8 contents. Used by `pnpm smoke` (which runs
// scripts/phase0-smoke.ts via tsx, which doesn't have a built-in .md loader).
//
// Webpack/Turbopack/Vitest each handle `.md` imports independently in their
// own configs — this loader covers ONLY the Node-via-tsx path.
//
// See .planning/quick/003-fix-pilot-deploy-workarounds-into-real-fixes/.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

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
