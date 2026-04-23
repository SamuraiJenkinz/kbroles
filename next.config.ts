import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle at `.next/standalone/server.js`
  // for the Azure App Service deploy (Plan 05-05 / DELV-02). The GitHub
  // Actions workflow copies `public/` + `.next/static/` INTO the standalone
  // folder (Pitfall 3 — Next omits them by default) and uploads the whole
  // directory. Azure App Service startup command is `node server.js`.
  // Requires `.npmrc node-linker=hoisted` (Plan 05-01 / Pitfall 10) so the
  // standalone tracer can resolve deps from a flat node_modules tree.
  output: 'standalone',
  // Prevent Turbopack from bundling pino's worker-thread deps (thread-stream,
  // real-require, etc). Without this, `next dev` / `next build` crashes with
  // `Cannot find module 'real-require'` at runtime. Next 16.1+ auto-resolves
  // the transitive chain when the direct packages are declared here
  // (RESEARCH.md §Pattern 5; this project is on Next 16.2.4 — see GH #84766).
  serverExternalPackages: ['pino', 'pino-pretty'],
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
