import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { EvalFixture } from './types'

const TurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const FixtureSchema = z.object({
  id: z.string().min(1),
  suite: z.string().min(1),
  role: z.enum(['consumer', 'author']).optional(),
  input: z.union([
    z.string(),
    z.object({ turns: z.array(TurnSchema) }),
  ]),
  expected_behavior: z.string(),
  notes: z.string().optional(),
  added_by: z.string().optional(),
  added_date: z.string().optional(),
  source: z.string().optional(),
})

/**
 * Load and validate fixtures for a suite from src/evals/fixtures/<suite>.json.
 * Throws a descriptive error if the file is missing or any fixture is malformed.
 */
export async function loadFixtures(suite: string): Promise<EvalFixture[]> {
  const file = path.join(process.cwd(), 'src/evals/fixtures', `${suite}.json`)
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (err) {
    throw new Error(
      `Eval fixture file not found for suite "${suite}": ${file}\n` +
      `Create src/evals/fixtures/${suite}.json to run this suite.\n` +
      String(err),
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(
      `Eval fixture file for suite "${suite}" is not valid JSON: ${file}\n${String(err)}`,
    )
  }

  const result = z.array(FixtureSchema).safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Eval fixture file for suite "${suite}" failed schema validation:\n` +
      result.error.issues
        .map(i => `  [${i.path.join('.')}] ${i.message}`)
        .join('\n'),
    )
  }

  if (result.data.length === 0) {
    throw new Error(`Eval fixture file for suite "${suite}" is empty (zero fixtures).`)
  }

  return result.data as EvalFixture[]
}
