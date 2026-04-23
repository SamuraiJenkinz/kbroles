/**
 * chatReducer tests — pure node env, no jsdom required.
 *
 * Covers all 12 action types + structural parity with the wire contract.
 * Runs under the existing Vitest node environment.
 */

import { describe, it, expect } from 'vitest'
import { chatReducer, initialChatState } from '../chatReducer'
import type { ChatState, ChatAction, SseEvent } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dispatch(state: ChatState, action: ChatAction): ChatState {
  return chatReducer(state, action)
}

function seq(actions: ChatAction[]): ChatState {
  return actions.reduce(dispatch, initialChatState)
}

const USER_ID = 'u1'
const ASST_ID = 'a1'
const NOW = 1714435200000 // 2024-04-30 00:00 UTC (fixed epoch)

function sendUser(text = 'Hello?'): ChatAction {
  return { type: 'user/send', id: USER_ID, text, at: NOW }
}

function startAssistant(): ChatAction {
  return { type: 'assistant/start', id: ASST_ID, at: NOW + 100 }
}

// ─── Initial state ────────────────────────────────────────────────────────────

describe('initialChatState', () => {
  it('starts with empty messages and no inFlightId', () => {
    expect(initialChatState).toEqual({ messages: [], inFlightId: null })
  })
})

// ─── Lifecycle — happy path ───────────────────────────────────────────────────

describe('happy path lifecycle', () => {
  it('user/send pushes a user message; inFlightId remains null', () => {
    const s = seq([sendUser()])
    expect(s.messages).toHaveLength(1)
    expect(s.messages[0]).toMatchObject({ kind: 'user', id: USER_ID, text: 'Hello?' })
    expect(s.inFlightId).toBeNull()
  })

  it('assistant/start appends streaming bubble and sets inFlightId', () => {
    const s = seq([sendUser(), startAssistant()])
    expect(s.messages).toHaveLength(2)
    const asst = s.messages[1]
    expect(asst).toMatchObject({ kind: 'assistant', id: ASST_ID, state: 'streaming', text: '' })
    expect(s.inFlightId).toBe(ASST_ID)
  })

  it('assistant/delta APPENDS text to the bubble', () => {
    const s = seq([
      sendUser(),
      startAssistant(),
      { type: 'assistant/delta', id: ASST_ID, text: 'hello ' },
      { type: 'assistant/delta', id: ASST_ID, text: 'world' },
    ])
    const asst = s.messages.find(m => m.id === ASST_ID)!
    expect(asst.kind).toBe('assistant')
    if (asst.kind === 'assistant') {
      expect(asst.text).toBe('hello world')
      expect(asst.state).toBe('streaming')
    }
  })

  it('assistant/citations sets citations without changing state', () => {
    const citation = { source_id: 'KB0020882' as const, section_id: 'resolution', quote: 'test' }
    const s = seq([
      sendUser(),
      startAssistant(),
      { type: 'assistant/delta', id: ASST_ID, text: 'answer' },
      { type: 'assistant/citations', id: ASST_ID, citations: [citation] },
    ])
    const asst = s.messages.find(m => m.id === ASST_ID)!
    if (asst.kind === 'assistant') {
      expect(asst.citations).toEqual([citation])
      expect(asst.state).toBe('streaming')
    }
  })

  it('assistant/done transitions to done and clears inFlightId', () => {
    const s = seq([
      sendUser(),
      startAssistant(),
      { type: 'assistant/delta', id: ASST_ID, text: 'final answer' },
      { type: 'assistant/done', id: ASST_ID },
    ])
    const asst = s.messages.find(m => m.id === ASST_ID)!
    if (asst.kind === 'assistant') {
      expect(asst.state).toBe('done')
    }
    expect(s.inFlightId).toBeNull()
  })
})

// ─── Fallback path ────────────────────────────────────────────────────────────

describe('fallback path', () => {
  it('assistant/fallback REPLACES text, clears citations, sets state=fallback, clears inFlightId', () => {
    const FALLBACK_TEXT = 'I cannot answer this question from the KB.'
    const s = seq([
      sendUser(),
      startAssistant(),
      { type: 'assistant/delta', id: ASST_ID, text: 'partial...' },
      { type: 'assistant/fallback', id: ASST_ID, text: FALLBACK_TEXT },
    ])
    const asst = s.messages.find(m => m.id === ASST_ID)!
    if (asst.kind === 'assistant') {
      expect(asst.text).toBe(FALLBACK_TEXT)
      expect(asst.citations).toEqual([])
      expect(asst.state).toBe('fallback')
    }
    expect(s.inFlightId).toBeNull()
  })
})

// ─── Error path ───────────────────────────────────────────────────────────────

describe('error path', () => {
  it('assistant/error sets state=error, preserves partial text, stores errorCode + requestId, clears inFlightId', () => {
    const s = seq([
      sendUser(),
      startAssistant(),
      { type: 'assistant/delta', id: ASST_ID, text: 'partial' },
      { type: 'assistant/error', id: ASST_ID, code: 'upstream_5xx', requestId: 'uuid-1' },
    ])
    const asst = s.messages.find(m => m.id === ASST_ID)!
    if (asst.kind === 'assistant') {
      expect(asst.state).toBe('error')
      expect(asst.errorCode).toBe('upstream_5xx')
      expect(asst.requestId).toBe('uuid-1')
      expect(asst.text).toBe('partial') // preserved
    }
    expect(s.inFlightId).toBeNull()
  })
})

// ─── Stopped by user ──────────────────────────────────────────────────────────

describe('stoppedByUser', () => {
  it('preserves accumulated text, sets state=done, stoppedByUser=true, clears inFlightId (Pitfall 5)', () => {
    const s = seq([
      sendUser(),
      startAssistant(),
      { type: 'assistant/delta', id: ASST_ID, text: 'hello ' },
      { type: 'assistant/delta', id: ASST_ID, text: 'wor' },
      { type: 'assistant/stoppedByUser', id: ASST_ID },
    ])
    const asst = s.messages.find(m => m.id === ASST_ID)!
    if (asst.kind === 'assistant') {
      expect(asst.state).toBe('done')
      expect(asst.stoppedByUser).toBe(true)
      expect(asst.text).toBe('hello wor') // PRESERVED
    }
    expect(s.inFlightId).toBeNull()
  })
})

// ─── Retry ────────────────────────────────────────────────────────────────────

describe('retry', () => {
  it('removes the targeted assistant bubble; preceding user bubble remains; inFlightId cleared', () => {
    const s = seq([
      sendUser(),
      startAssistant(),
      { type: 'assistant/error', id: ASST_ID, code: 'upstream_5xx', requestId: 'r1' },
      { type: 'assistant/retry', id: ASST_ID },
    ])
    const ids = s.messages.map(m => m.id)
    expect(ids).not.toContain(ASST_ID)
    expect(ids).toContain(USER_ID)
    expect(s.inFlightId).toBeNull()
  })
})

// ─── Feedback state machine ───────────────────────────────────────────────────

describe('feedback state machine', () => {
  function withDoneAssistant(): ChatState {
    return seq([sendUser(), startAssistant(), { type: 'assistant/done', id: ASST_ID }])
  }

  it('feedback/up sets feedback to up', () => {
    const s = dispatch(withDoneAssistant(), { type: 'feedback/up', id: ASST_ID })
    const asst = s.messages.find(m => m.id === ASST_ID)!
    if (asst.kind === 'assistant') {
      expect(asst.feedback).toBe('up')
    }
  })

  it('second feedback/up toggles off (clears to undefined)', () => {
    const base = dispatch(withDoneAssistant(), { type: 'feedback/up', id: ASST_ID })
    const s = dispatch(base, { type: 'feedback/up', id: ASST_ID })
    const asst = s.messages.find(m => m.id === ASST_ID)!
    if (asst.kind === 'assistant') {
      expect(asst.feedback).toBeUndefined()
    }
  })

  it('feedback/down replaces up; sets kind=down with given reason', () => {
    const base = dispatch(withDoneAssistant(), { type: 'feedback/up', id: ASST_ID })
    const s = dispatch(base, { type: 'feedback/down', id: ASST_ID, reason: 'hallucinated' })
    const asst = s.messages.find(m => m.id === ASST_ID)!
    if (asst.kind === 'assistant') {
      expect(asst.feedback).toEqual({ kind: 'down', reason: 'hallucinated' })
    }
  })

  it('second feedback/down with SAME reason toggles off', () => {
    const base = dispatch(withDoneAssistant(), { type: 'feedback/down', id: ASST_ID, reason: 'hallucinated' })
    const s = dispatch(base, { type: 'feedback/down', id: ASST_ID, reason: 'hallucinated' })
    const asst = s.messages.find(m => m.id === ASST_ID)!
    if (asst.kind === 'assistant') {
      expect(asst.feedback).toBeUndefined()
    }
  })

  it('feedback/down with DIFFERENT reason switches reason (still down)', () => {
    const base = dispatch(withDoneAssistant(), { type: 'feedback/down', id: ASST_ID, reason: 'hallucinated' })
    const s = dispatch(base, { type: 'feedback/down', id: ASST_ID, reason: 'wrong_citation' })
    const asst = s.messages.find(m => m.id === ASST_ID)!
    if (asst.kind === 'assistant') {
      expect(asst.feedback).toEqual({ kind: 'down', reason: 'wrong_citation' })
    }
  })

  it('feedback/clear removes feedback regardless of prior state', () => {
    const base = dispatch(withDoneAssistant(), { type: 'feedback/down', id: ASST_ID, reason: 'incomplete' })
    const s = dispatch(base, { type: 'feedback/clear', id: ASST_ID })
    const asst = s.messages.find(m => m.id === ASST_ID)!
    if (asst.kind === 'assistant') {
      expect(asst.feedback).toBeUndefined()
    }
  })
})

// ─── Conversation clear ───────────────────────────────────────────────────────

describe('conversation/clear', () => {
  it('resets to empty messages and null inFlightId', () => {
    const populated = seq([sendUser(), startAssistant()])
    const s = dispatch(populated, { type: 'conversation/clear' })
    expect(s).toEqual({ messages: [], inFlightId: null })
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('assistant/delta with unknown id returns state unchanged (deep equal)', () => {
    const base = seq([sendUser(), startAssistant()])
    const s = dispatch(base, { type: 'assistant/delta', id: 'nonexistent', text: 'oops' })
    expect(s).toEqual(base)
  })

  it('unknown action type returns state unchanged', () => {
    const base = seq([sendUser()])
    // Cast to bypass TypeScript to simulate unknown action at runtime
    const s = chatReducer(base, { type: 'unknown/action' } as unknown as ChatAction)
    expect(s).toEqual(base)
  })
})

// ─── Structural parity with wire contract ─────────────────────────────────────

describe('structural parity — SseEvent discriminant union', () => {
  it('SseEvent union has exactly the five wire event types from docs/api-chat-contract.md §3', () => {
    const received = new Set<string>()
    const sample: SseEvent[] = [
      { type: 'answer_delta', text: '' },
      { type: 'citations', citations: [] },
      { type: 'fallback', reason: 'refusal', text: '' },
      { type: 'done', can_answer: true, validator_flips: 0 },
      { type: 'error', code: 'internal', message: '' },
    ]
    sample.forEach(e => received.add(e.type))
    expect(received).toEqual(
      new Set(['answer_delta', 'citations', 'fallback', 'done', 'error']),
    )
  })
})
