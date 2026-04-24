import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

/**
 * Separate Vitest configuration for eval suites.
 *
 * This config is intentionally isolated from vitest.config.mts (the main test
 * runner). It only picks up *.eval.ts files under src/evals/suites/. The main
 * config excludes src/evals/suites/** so these files NEVER run under pnpm test.
 *
 * Usage:
 *   pnpm eval           — run all eval suites
 *   pnpm eval:fast      — run deterministic suites only (entity-allowlist + citation-substring)
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['src/evals/suites/**/*.eval.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    reporters: ['default'],
    pool: 'forks',
    // Suites must run sequentially (not in parallel) so that mergeAndWriteReport
    // does not encounter a read-modify-write race when two suites try to update
    // ops/evals/latest.json at the same time. maxWorkers=1 enforces sequential
    // file execution while still isolating each suite in its own fork.
    maxWorkers: 1,
    minWorkers: 1,
  },
})
