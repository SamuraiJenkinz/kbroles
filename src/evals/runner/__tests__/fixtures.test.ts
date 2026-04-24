import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadFixtures } from '../fixtures'

// We temporarily write fixture files into a tmpdir and redirect process.cwd()
// so loadFixtures resolves relative paths correctly.
let tmpDir: string
let origCwd: string

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `eval-fixtures-test-${Date.now()}`)
  await mkdir(path.join(tmpDir, 'src/evals/fixtures'), { recursive: true })
  origCwd = process.cwd()
  // Override cwd resolution by writing files relative to the actual cwd path,
  // but we instead patch process.cwd in the test using a vi.spyOn.
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// Helper: write a fixture array to src/evals/fixtures/<suite>.json under tmpDir
async function writeFixtures(suite: string, data: unknown): Promise<void> {
  const dir = path.join(tmpDir, 'src/evals/fixtures')
  await writeFile(path.join(dir, `${suite}.json`), JSON.stringify(data), 'utf8')
}

// We can't easily override process.cwd() without mocking, so we test the
// loader by writing into the REAL cwd path. Use a unique suite name so we
// don't collide with real fixtures, and clean up afterwards.
const TEST_SUITE = `_test-fixture-${Date.now()}`
const TEST_SUITE_DIR = path.join(process.cwd(), 'src/evals/fixtures')
const TEST_SUITE_FILE = path.join(TEST_SUITE_DIR, `${TEST_SUITE}.json`)

afterEach(async () => {
  await rm(TEST_SUITE_FILE, { force: true })
})

describe('loadFixtures', () => {
  it('loads and validates a well-formed fixture array', async () => {
    const fixtures = [
      {
        id: 'test-001',
        suite: TEST_SUITE,
        role: 'consumer',
        input: 'Some answer text.',
        expected_behavior: 'pass',
        notes: 'A passing case',
        added_by: 'vitest',
        added_date: '2026-04-24',
        source: 'synthetic',
      },
    ]
    await writeFile(TEST_SUITE_FILE, JSON.stringify(fixtures), 'utf8')

    const loaded = await loadFixtures(TEST_SUITE)
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe('test-001')
    expect(loaded[0].suite).toBe(TEST_SUITE)
    expect(loaded[0].role).toBe('consumer')
    expect(loaded[0].input).toBe('Some answer text.')
    expect(loaded[0].expected_behavior).toBe('pass')
  })

  it('loads fixtures with a turns-style input', async () => {
    const fixtures = [
      {
        id: 'test-002',
        suite: TEST_SUITE,
        input: {
          turns: [
            { role: 'user', content: 'What is the approval process?' },
            { role: 'assistant', content: 'You need to click Publish first.' },
          ],
        },
        expected_behavior: 'pass',
      },
    ]
    await writeFile(TEST_SUITE_FILE, JSON.stringify(fixtures), 'utf8')

    const loaded = await loadFixtures(TEST_SUITE)
    expect(loaded).toHaveLength(1)
    const input = loaded[0].input as { turns: Array<{ role: string; content: string }> }
    expect(input.turns).toHaveLength(2)
    expect(input.turns[0].role).toBe('user')
  })

  it('throws a descriptive error when the file does not exist', async () => {
    await expect(loadFixtures('_nonexistent-suite-xyz')).rejects.toThrow(
      /fixture file not found for suite "_nonexistent-suite-xyz"/,
    )
  })

  it('throws on malformed JSON', async () => {
    await writeFile(TEST_SUITE_FILE, '{ not valid json', 'utf8')
    await expect(loadFixtures(TEST_SUITE)).rejects.toThrow(
      /not valid JSON/,
    )
  })

  it('throws a schema error when a required field is missing', async () => {
    const bad = [{ suite: TEST_SUITE, input: 'text' }] // missing id + expected_behavior
    await writeFile(TEST_SUITE_FILE, JSON.stringify(bad), 'utf8')
    await expect(loadFixtures(TEST_SUITE)).rejects.toThrow(/failed schema validation/)
  })

  it('throws when the fixture file is an empty array', async () => {
    await writeFile(TEST_SUITE_FILE, JSON.stringify([]), 'utf8')
    await expect(loadFixtures(TEST_SUITE)).rejects.toThrow(/empty \(zero fixtures\)/)
  })
})
