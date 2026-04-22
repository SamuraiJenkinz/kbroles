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
