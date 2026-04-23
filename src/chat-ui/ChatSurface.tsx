'use client'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { chatReducer, initialChatState } from './chatReducer'
import { useChatStream } from './useChatStream'
import { useDraftBuffer } from './useDraftBuffer'
import { usePrompts } from './usePrompts'
import type { Role, SseEvent, Message } from './types'
import { Header } from './Header'
import { Greeting } from './Greeting'
import { MessageList } from './MessageList'
import { ChipRow } from './ChipRow'
import { InputBar } from './InputBar'
import { ChangeRoleDialog } from './ChangeRoleDialog'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLACEHOLDER: Record<Role, string> = {
  consumer: 'Ask about KB flagging, feedback, or article workflows…',
  author: 'Ask about KB form fields, anchors, or publishing…',
}

/**
 * Build the wire messages array for /api/chat POST body.
 * Includes all prior completed user + assistant turns, then appends the new user text.
 */
function buildWireMessages(
  messages: Message[],
  appendedUserText: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const prior = messages
    .filter(m => m.kind === 'user' || (m.kind === 'assistant' && m.state === 'done'))
    .map(m => ({
      role: (m.kind === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    }))
  return [...prior, { role: 'user' as const, content: appendedUserText }]
}

// ─── ChatSurface ──────────────────────────────────────────────────────────────

export function ChatSurface({
  role,
  onChangeRole,
}: {
  role: Role
  onChangeRole: () => void
}) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const { draft, setDraft, clearDraft } = useDraftBuffer()
  const { chips } = usePrompts(role)
  const asstIdRef = useRef<string | null>(null)
  // consumes Plan 04's forwardRef<HTMLTextAreaElement, InputBarProps>
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [changeRoleOpen, setChangeRoleOpen] = useState(false)

  // ── Event handler: routes SSE events into chatReducer ──────────────────────
  // (LOCKED event→dispatch map from plan context)
  const handleEvent = useCallback((ev: SseEvent, requestId: string) => {
    const id = asstIdRef.current
    if (id === null) return  // race: event arrived after retry/clear wiped the bubble
    switch (ev.type) {
      case 'answer_delta':
        dispatch({ type: 'assistant/delta', id, text: ev.text })
        break
      case 'citations':
        dispatch({ type: 'assistant/citations', id, citations: ev.citations })
        break
      case 'done':
        dispatch({ type: 'assistant/done', id })
        asstIdRef.current = null
        break
      case 'fallback':
        dispatch({ type: 'assistant/fallback', id, text: ev.text })
        asstIdRef.current = null
        break
      case 'error':
        dispatch({ type: 'assistant/error', id, code: ev.code, requestId })
        asstIdRef.current = null
        break
    }
  }, [])

  const { send, stop, isStreaming } = useChatStream(handleEvent)

  // ── Send a message (chip click or freeform) ────────────────────────────────
  const dispatchSend = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const userId = crypto.randomUUID()
      const asstId = crypto.randomUUID()
      const now = Date.now()
      dispatch({ type: 'user/send', id: userId, text: trimmed, at: now })
      dispatch({ type: 'assistant/start', id: asstId, at: now })
      asstIdRef.current = asstId
      // Pitfall 4: role passed as argument to send(), not captured from closure.
      void send(role, buildWireMessages(state.messages, trimmed))
      // clearDraft writes '' to sessionStorage and updates hook state.
      clearDraft()
      inputRef.current?.focus()
    },
    [role, send, clearDraft, state.messages],
  )

  // ── New conversation (CHAT-04 — no confirm) ────────────────────────────────
  const handleNewConversation = useCallback(() => {
    if (state.inFlightId != null) stop()
    dispatch({ type: 'conversation/clear' })
    clearDraft()
    asstIdRef.current = null
    inputRef.current?.focus()
  }, [state.inFlightId, stop, clearDraft])

  // ── Change role confirm (Pitfall 13 LOCKED ORDER) ─────────────────────────
  // Order: stop() → conversation/clear → asstIdRef=null → setChangeRoleOpen(false)
  //        → onChangeRole() [sets role=null in ChatPage] → clearDraft()
  const handleConfirmChangeRole = useCallback(() => {
    stop()                                    // 1. abort in-flight stream
    dispatch({ type: 'conversation/clear' })  // 2. wipe messages + inFlightId
    asstIdRef.current = null                  // 3. prevent stale handleEvent dispatch
    setChangeRoleOpen(false)                  // 4. close dialog
    onChangeRole()                            // 5. setRole(null) in ChatPage → unmounts us
    clearDraft()                              // 6. clear sessionStorage draft
  }, [stop, onChangeRole, clearDraft])

  // ── Stop (inline stop button) ──────────────────────────────────────────────
  const handleStop = useCallback(() => {
    const id = state.inFlightId
    if (id == null) return
    stop()
    dispatch({ type: 'assistant/stoppedByUser', id })
    asstIdRef.current = null
  }, [state.inFlightId, stop])

  // ── Retry (CHAT-07 — reconstruct last user turn) ───────────────────────────
  const handleRetry = useCallback(
    (errorBubbleId: string) => {
      const idx = state.messages.findIndex(m => m.id === errorBubbleId)
      if (idx <= 0) return
      const userMsg = state.messages[idx - 1]
      if (userMsg.kind !== 'user') return

      dispatch({ type: 'assistant/retry', id: errorBubbleId })  // remove failed bubble
      const asstId = crypto.randomUUID()
      dispatch({ type: 'assistant/start', id: asstId, at: Date.now() })
      asstIdRef.current = asstId

      // Rebuild wire WITHOUT the failed assistant bubble (already removed by retry action).
      const priorMessages = state.messages.slice(0, idx) // up to and including userMsg
      const wire = priorMessages
        .filter(m => m.kind === 'user' || (m.kind === 'assistant' && m.state === 'done'))
        .map(m => ({
          role: (m.kind === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.text,
        }))
      void send(role, wire)
    },
    [state.messages, role, send],
  )

  // ── Feedback ───────────────────────────────────────────────────────────────
  const handleFeedback = useCallback(
    (
      id: string,
      next:
        | 'up'
        | { kind: 'down'; reason: 'hallucinated' | 'wrong_citation' | 'incomplete' | 'other' }
        | null,
    ) => {
      if (next === null) dispatch({ type: 'feedback/clear', id })
      else if (next === 'up') dispatch({ type: 'feedback/up', id })
      else dispatch({ type: 'feedback/down', id, reason: next.reason })
    },
    [],
  )

  // Auto-focus textarea on mount and after role transition (each ChatSurface render).
  useEffect(() => { inputRef.current?.focus() }, [])

  const isEmpty = state.messages.length === 0

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        role={role}
        onChangeRole={() => setChangeRoleOpen(true)}
        onNewConversation={handleNewConversation}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {isEmpty && <Greeting role={role} />}
          <MessageList
            messages={state.messages}
            inFlightId={state.inFlightId}
            onCopy={() => { /* copy handled internally by AssistantControls */ }}
            onFeedback={handleFeedback}
            onRetry={handleRetry}   // consumes Plan 04's onRetry prop (no mutation)
          />
        </div>
        {isEmpty && (
          <ChipRow chips={chips} onChip={dispatchSend} disabled={isStreaming} />
        )}
        <InputBar
          ref={inputRef}           // consumes Plan 04's forwardRef (no mutation)
          value={draft}
          onChange={setDraft}
          onSubmit={() => dispatchSend(draft)}
          onStop={handleStop}
          isStreaming={isStreaming}
          placeholder={PLACEHOLDER[role]}
          hintVisible={isEmpty}
        />
      </main>
      <ChangeRoleDialog
        open={changeRoleOpen}
        onOpenChange={setChangeRoleOpen}
        onConfirm={handleConfirmChangeRole}
      />
    </div>
  )
}
