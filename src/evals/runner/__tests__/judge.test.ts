import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoist the mock factory so vi.mock() is executed before any imports ──────
const mockCreate = vi.hoisted(() => vi.fn())

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  }
})

import { createJudgeClient, judgeBinary } from '../judge'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCompletion(content: string) {
  return {
    choices: [{ message: { content } }],
  }
}

function setupVotes(votes: Array<0 | 1>) {
  let callIdx = 0
  mockCreate.mockImplementation(async () => {
    const v = votes[callIdx++ % votes.length]
    return makeCompletion(v === 1 ? '1' : '0')
  })
}

// ── createJudgeClient ─────────────────────────────────────────────────────────

describe('createJudgeClient', () => {
  const origKey = process.env.LLM_JUDGE_API_KEY

  afterEach(() => {
    if (origKey === undefined) {
      delete process.env.LLM_JUDGE_API_KEY
    } else {
      process.env.LLM_JUDGE_API_KEY = origKey
    }
  })

  it('throws when LLM_JUDGE_API_KEY is absent', () => {
    delete process.env.LLM_JUDGE_API_KEY
    expect(() => createJudgeClient()).toThrow('LLM_JUDGE_API_KEY absent')
  })

  it('does not throw when LLM_JUDGE_API_KEY is present', () => {
    process.env.LLM_JUDGE_API_KEY = 'test-key'
    expect(() => createJudgeClient()).not.toThrow()
  })
})

// ── JudgeClient.judge — response parsing ─────────────────────────────────────

describe('JudgeClient.judge response parsing', () => {
  beforeEach(() => {
    process.env.LLM_JUDGE_API_KEY = 'test-key'
  })

  afterEach(() => {
    delete process.env.LLM_JUDGE_API_KEY
    mockCreate.mockReset()
  })

  it('parses "1" as 1', async () => {
    mockCreate.mockResolvedValueOnce(makeCompletion('1'))
    const client = createJudgeClient()
    expect(await client.judge('prompt')).toBe(1)
  })

  it('parses "0" as 0', async () => {
    mockCreate.mockResolvedValueOnce(makeCompletion('0'))
    const client = createJudgeClient()
    expect(await client.judge('prompt')).toBe(0)
  })

  it('parses "1." as 1 (trailing punctuation)', async () => {
    mockCreate.mockResolvedValueOnce(makeCompletion('1.'))
    const client = createJudgeClient()
    expect(await client.judge('prompt')).toBe(1)
  })

  it('parses " 1\\n" as 1 (leading space + trailing newline)', async () => {
    mockCreate.mockResolvedValueOnce(makeCompletion(' 1\n'))
    const client = createJudgeClient()
    // .trim() in judge strips the whitespace before startsWith check
    expect(await client.judge('prompt')).toBe(1)
  })

  it('does NOT make a real network call (mock intercepts)', async () => {
    mockCreate.mockResolvedValueOnce(makeCompletion('1'))
    const client = createJudgeClient()
    await client.judge('test')
    expect(mockCreate).toHaveBeenCalledTimes(1)
    // Verify the call was to the mock, not a real endpoint
    expect(mockCreate.mock.calls[0]).toBeDefined()
  })
})

// ── judgeBinary — best-of-3 majority vote ────────────────────────────────────

describe('judgeBinary best-of-3 majority vote', () => {
  beforeEach(() => {
    process.env.LLM_JUDGE_API_KEY = 'test-key'
  })

  afterEach(() => {
    delete process.env.LLM_JUDGE_API_KEY
    mockCreate.mockReset()
  })

  it('[1,1,0] → 1 (majority pass)', async () => {
    setupVotes([1, 1, 0])
    const client = createJudgeClient()
    expect(await judgeBinary(client, 'prompt')).toBe(1)
  })

  it('[1,0,1] → 1 (majority pass)', async () => {
    setupVotes([1, 0, 1])
    const client = createJudgeClient()
    expect(await judgeBinary(client, 'prompt')).toBe(1)
  })

  it('[0,1,1] → 1 (majority pass)', async () => {
    setupVotes([0, 1, 1])
    const client = createJudgeClient()
    expect(await judgeBinary(client, 'prompt')).toBe(1)
  })

  it('[0,0,1] → 0 (majority fail)', async () => {
    setupVotes([0, 0, 1])
    const client = createJudgeClient()
    expect(await judgeBinary(client, 'prompt')).toBe(0)
  })

  it('[0,1,0] → 0 (majority fail)', async () => {
    setupVotes([0, 1, 0])
    const client = createJudgeClient()
    expect(await judgeBinary(client, 'prompt')).toBe(0)
  })

  it('[1,0,0] → 0 (majority fail)', async () => {
    setupVotes([1, 0, 0])
    const client = createJudgeClient()
    expect(await judgeBinary(client, 'prompt')).toBe(0)
  })

  it('[0,0,0] → 0 (all fail)', async () => {
    setupVotes([0, 0, 0])
    const client = createJudgeClient()
    expect(await judgeBinary(client, 'prompt')).toBe(0)
  })

  it('[1,1,1] → 1 (all pass)', async () => {
    setupVotes([1, 1, 1])
    const client = createJudgeClient()
    expect(await judgeBinary(client, 'prompt')).toBe(1)
  })

  it('makes exactly 3 judge calls per judgeBinary invocation', async () => {
    setupVotes([1, 1, 0])
    const client = createJudgeClient()
    await judgeBinary(client, 'prompt')
    expect(mockCreate).toHaveBeenCalledTimes(3)
  })
})
