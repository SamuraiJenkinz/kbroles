/**
 * chatReducer — pure state machine for the KB Assistant chat UI.
 *
 * Pure function: (state: ChatState, action: ChatAction) => ChatState
 * No React imports. No side effects. No mutation of state.
 * Runs under node-env Vitest and React 19 useReducer without modification.
 *
 * Transition semantics derive from docs/api-chat-contract.md §3/§4 and
 * the CONTEXT §Chat surface styling + §Thumbs rules locked in Phase 3.
 */

import type { ChatState, ChatAction, Message, Citation, Feedback } from './types'

// ─── Initial state ───────────────────────────────────────────────────────────

export const initialChatState: ChatState = {
  messages: [],
  inFlightId: null,
}

// ─── Helper: immutable message patch ─────────────────────────────────────────

function updateMessage(
  state: ChatState,
  id: string,
  patch: (m: Message) => Message,
): ChatState {
  const idx = state.messages.findIndex(m => m.id === id)
  if (idx === -1) return state
  const next = [...state.messages]
  next[idx] = patch(state.messages[idx])
  return { ...state, messages: next }
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    /**
     * user/send — push a user message. inFlightId is NOT set here;
     * assistant/start sets it when the server begins the response.
     */
    case 'user/send': {
      const msg: Message = {
        kind: 'user',
        id: action.id,
        text: action.text,
        at: action.at,
      }
      return { ...state, messages: [...state.messages, msg] }
    }

    /**
     * assistant/start — push a new streaming assistant bubble and set inFlightId.
     */
    case 'assistant/start': {
      const msg: Message = {
        kind: 'assistant',
        id: action.id,
        state: 'streaming',
        text: '',
        citations: [],
        at: action.at,
      }
      return {
        messages: [...state.messages, msg],
        inFlightId: action.id,
      }
    }

    /**
     * assistant/delta — APPEND text to the in-progress bubble.
     * Contract §3: answer_delta semantics = append, not replace.
     */
    case 'assistant/delta': {
      return updateMessage(state, action.id, m => {
        if (m.kind !== 'assistant') return m
        return { ...m, text: m.text + action.text }
      })
    }

    /**
     * assistant/citations — attach citations; bubble remains 'streaming'.
     * Contract §4.1: citations arrive after all answer_delta frames.
     */
    case 'assistant/citations': {
      return updateMessage(state, action.id, m => {
        if (m.kind !== 'assistant') return m
        return { ...m, citations: action.citations as Citation[] }
      })
    }

    /**
     * assistant/done — mark bubble complete. Clear inFlightId.
     */
    case 'assistant/done': {
      const next = updateMessage(state, action.id, m => {
        if (m.kind !== 'assistant') return m
        return { ...m, state: 'done' }
      })
      return { ...next, inFlightId: null }
    }

    /**
     * assistant/fallback — REPLACE accumulated text (not append), clear citations,
     * set state='fallback'. Contract §3 and §4.2: fallback replaces.
     * CONTEXT §Chat surface styling: fallback adds left-border accent.
     */
    case 'assistant/fallback': {
      const next = updateMessage(state, action.id, m => {
        if (m.kind !== 'assistant') return m
        return { ...m, text: action.text, citations: [], state: 'fallback' }
      })
      return { ...next, inFlightId: null }
    }

    /**
     * assistant/error — mark bubble as error; preserve accumulated text
     * (ErrorCard overlays bubble; partial text retained for diagnostics).
     * Store errorCode + requestId for X-Request-Id surfacing.
     */
    case 'assistant/error': {
      const next = updateMessage(state, action.id, m => {
        if (m.kind !== 'assistant') return m
        return {
          ...m,
          state: 'error',
          errorCode: action.code,
          requestId: action.requestId,
        }
      })
      return { ...next, inFlightId: null }
    }

    /**
     * assistant/stoppedByUser — mark bubble done + stoppedByUser=true.
     * PRESERVE accumulated text (Pitfall 5 — partial text already rendered stays).
     */
    case 'assistant/stoppedByUser': {
      const next = updateMessage(state, action.id, m => {
        if (m.kind !== 'assistant') return m
        return { ...m, state: 'done', stoppedByUser: true }
      })
      return { ...next, inFlightId: null }
    }

    /**
     * assistant/retry — REMOVE the targeted assistant bubble.
     * Caller (Plan 05 wiring) re-dispatches user/send → assistant/start.
     * Clear inFlightId if it matched the removed bubble.
     */
    case 'assistant/retry': {
      const filtered = state.messages.filter(m => m.id !== action.id)
      return {
        messages: filtered,
        inFlightId: state.inFlightId === action.id ? null : state.inFlightId,
      }
    }

    /**
     * feedback/up — toggle 'up'. Clicking same state a second time clears it.
     * Mutually exclusive with 'down' — replaces any existing down feedback.
     */
    case 'feedback/up': {
      return updateMessage(state, action.id, m => {
        if (m.kind !== 'assistant') return m
        const alreadyUp = (m.feedback as Feedback | undefined) === 'up'
        return { ...m, feedback: alreadyUp ? undefined : 'up' }
      })
    }

    /**
     * feedback/down — set {kind:'down', reason}. Toggle-same-reason clears.
     * Switching reason replaces (still down, different reason).
     * CONTEXT §Thumbs: "Clicking again toggles off".
     */
    case 'feedback/down': {
      return updateMessage(state, action.id, m => {
        if (m.kind !== 'assistant') return m
        const current = m.feedback
        if (
          current !== undefined &&
          current !== 'up' &&
          current.kind === 'down' &&
          current.reason === action.reason
        ) {
          // Same reason clicked again — toggle off
          return { ...m, feedback: undefined }
        }
        return { ...m, feedback: { kind: 'down', reason: action.reason } }
      })
    }

    /**
     * feedback/clear — remove feedback regardless of prior state.
     */
    case 'feedback/clear': {
      return updateMessage(state, action.id, m => {
        if (m.kind !== 'assistant') return m
        const { feedback: _f, ...rest } = m
        void _f
        return rest as Message
      })
    }

    /**
     * conversation/clear — reset to empty state.
     * Role is managed outside the reducer (sessionStorage hook owns it per CONTEXT §Persistence).
     */
    case 'conversation/clear': {
      return { messages: [], inFlightId: null }
    }

    default: {
      // Exhaustive check — TypeScript will error if a case is missing above.
      const _exhaustive: never = action
      void _exhaustive
      return state
    }
  }
}
