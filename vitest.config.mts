import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'

// Vite/Vitest does NOT natively return raw string content for .md imports —
// `assetsInclude` makes it treat them as assets (returning URL/path strings,
// NOT the file contents). To match Next.js 16 Turbopack `{ type: 'raw' }`
// behaviour (Turbopack returns the file CONTENTS as a string module), we
// register a tiny Vite plugin that reads the file and exports its text as
// the default export. This keeps `import x from './file.md'` isomorphic
// between build (Turbopack/webpack) and test (Vitest) runtimes. No `?raw`
// suffix needed at call sites.
const rawMarkdown = {
  name: 'raw-markdown',
  enforce: 'pre' as const,
  transform(_code: string, id: string) {
    if (id.endsWith('.md')) {
      const content = readFileSync(id, 'utf-8')
      return {
        code: `export default ${JSON.stringify(content)}`,
        map: null,
      }
    }
    return null
  },
}

export default defineConfig({
  plugins: [react(), tsconfigPaths(), rawMarkdown],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.tsx',
      'scripts/**/__tests__/**/*.test.ts',
    ],
  },
})
