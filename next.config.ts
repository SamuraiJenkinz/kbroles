import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle at `.next/standalone/server.js`
  // for the on-prem Windows Server deploy (Phase 5.1 — DELV-01 reassigned
  // from Azure App Service). The GitHub Actions workflow (Plan 07) copies
  // `public/` + `.next/static/` INTO the standalone folder before uploading
  // as an artifact; the self-hosted Windows runner unpacks it and the
  // Windows Scheduled Task runs `node.exe server.js` (see docs/deploy-
  // windows.md). Requires `.npmrc node-linker=hoisted` so the standalone
  // tracer can resolve deps from a flat node_modules tree.
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
