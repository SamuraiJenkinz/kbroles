// Ambient module declaration so TypeScript accepts `import x from './x.md'`
// as a string. Webpack's `asset/source` rule, Turbopack's `'*.md':{type:'raw'}`
// rule, Vitest's `rawMarkdown` plugin, and the tsx loader hook
// (scripts/md-loader.mjs) all resolve such imports to the raw file contents
// as the default export.
declare module '*.md' {
  const content: string
  export default content
}
