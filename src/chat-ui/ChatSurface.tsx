'use client'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { chatReducer, initialChatState } from './chatReducer'
import { useChatStream } from './useChatStream'
import { useDraftBuffer } from './useDraftBuffer'
import { usePrompts } from './usePrompts'
import { usePanelState } from './usePanelState'
import { useConfig } from './useConfig'
import type { Role, SseEvent, Message } from './types'
import { Header } from './Header'
import { Greeting } from './Greeting'
import { MessageList } from './MessageList'
import { ChipRow } from './ChipRow'
import { InputBar } from './InputBar'
import { ChangeRoleDialog } from './ChangeRoleDialog'
import { SourcePanel } from './SourcePanel'
import { cn } from './cn'
import { acquireToken, signOut as msalSignOut } from '@/auth/tokenProvider'

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
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false)
  const router = useRouter()

  // ── Panel state (Phase 4 — source panel open/closed + loaded source) ────────
  const panel = usePanelState()

  // ── Config (Plan 04-03 — contentStewardEmail + freshness versions) ──────────
  const { config } = useConfig()

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
        // Phase 4: auto-open panel on first citation in session (CONTEXT §Auto-open trigger)
        if (ev.citations.length > 0) {
          const first = ev.citations[0]
          panel.autoOpenOnFirstCitation(first.source_id, first.section_id)
        }
        break
      case 'done':
        dispatch({ type: 'assistant/done', id })
        asstIdRef.current = null
        break
      case 'fallback':
        dispatch({ type: 'assistant/fallback', id, text: ev.text, requestId })
        asstIdRef.current = null
        break
      case 'error':
        dispatch({ type: 'assistant/error', id, code: ev.code, requestId })
        asstIdRef.current = null
        break
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.autoOpenOnFirstCitation])

  // ── Plan 05-04 Edit C: acquireToken DI for useChatStream Bearer header ─────
  // ChatSurface lives inside MsalProvider (via root Providers), so a top-level
  // import of tokenProvider is safe here — that's why the DI boundary is at
  // the hook, not this file.
  const boundAcquireToken = useCallback(() => acquireToken(null), [])
  const handleAccessDenied = useCallback(() => {
    router.replace('/access-denied')
  }, [router])

  const { send, stop, isStreaming } = useChatStream(handleEvent, {
    acquireToken: boundAcquireToken,
    onTokenExpired: () => { /* observe only; retry remains user-initiated via ErrorCard */ },
    onAccessDenied: handleAccessDenied,
  })

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
    panel.resetSession()  // re-arm auto-open latch for new session
    inputRef.current?.focus()
  }, [state.inFlightId, stop, clearDraft, panel.resetSession])

  // ── Change role confirm (Pitfall 13 LOCKED ORDER) ─────────────────────────
  // Order: stop() → conversation/clear → asstIdRef=null → setChangeRoleOpen(false)
  //        → onChangeRole() [sets role=null in ChatPage] → clearDraft() → resetSession()
  const handleConfirmChangeRole = useCallback(() => {
    stop()                                    // 1. abort in-flight stream
    dispatch({ type: 'conversation/clear' })  // 2. wipe messages + inFlightId
    asstIdRef.current = null                  // 3. prevent stale handleEvent dispatch
    setChangeRoleOpen(false)                  // 4. close dialog
    onChangeRole()                            // 5. setRole(null) in ChatPage → unmounts us
    clearDraft()                              // 6. clear sessionStorage draft
    panel.resetSession()                      // 7. re-arm auto-open for next role session
  }, [stop, onChangeRole, clearDraft, panel.resetSession])

  // ── Plan 05-04 Edit A: sign-out flow ───────────────────────────────────────
  // If there's a draft OR an in-flight stream, prompt a confirm dialog first.
  // On confirm: stop stream, clear in-memory chat state + draft + role, then
  // invoke tokenProvider.signOut() (→ msalInstance.logoutRedirect).
  const handleSignOutRequest = useCallback(() => {
    const dirty = draft.trim().length > 0 || state.inFlightId != null
    if (dirty) {
      setSignOutConfirmOpen(true)
      return
    }
    void msalSignOut()
  }, [draft, state.inFlightId])

  const handleConfirmSignOut = useCallback(() => {
    stop()                                    // abort in-flight stream
    dispatch({ type: 'conversation/clear' })  // wipe messages
    asstIdRef.current = null                  // prevent stale dispatch
    setSignOutConfirmOpen(false)              // close dialog
    clearDraft()                              // clear sessionStorage draft
    // Clear role BEFORE logoutRedirect — setRole(null) is synchronous; once
    // logout navigates away the user returns to / in an unauthenticated state
    // and the ChatPage should show RoleSelect, not the previous role.
    onChangeRole()
    panel.resetSession()
    void msalSignOut()
  }, [stop, clearDraft, onChangeRole, panel.resetSession])

  // ── Stop (inline stop button) ──────────────────────────────────────────────
  const handleStop = useCallback(() => {
    const id = state.inFlightId
    if (id == null) return
    stop()
    dispatch({ type: 'assistant/stoppedByUser', id })
    asstIdRef.current = null
  }, [state.inFlightId, stop])

  // ── Retry (CHAT-07 — reconstruct last user turn) ───────────────────────────
  // Plan 05-04 Edit D: when the retried bubble's errorCode === 'token_expired',
  // await acquireToken(null) FIRST so the replay carries a freshly acquired
  // Bearer. All other errorCodes keep the existing synchronous retry.
  const handleRetry = useCallback(
    async (errorBubbleId: string) => {
      const idx = state.messages.findIndex(m => m.id === errorBubbleId)
      if (idx <= 0) return
      const userMsg = state.messages[idx - 1]
      if (userMsg.kind !== 'user') return
      const errorMsg = state.messages[idx]
      const isTokenExpired =
        errorMsg.kind === 'assistant' && errorMsg.errorCode === 'token_expired'

      if (isTokenExpired) {
        try {
          await acquireToken(null)
        } catch {
          // Silent + interactive both failed; bail out so the error card
          // stays visible and the user can retry (which re-invokes this path).
          return
        }
      }

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
    <div className={cn('flex min-h-screen flex-col bg-background', panel.open && 'lg:flex-row')}>
      {/* Chat column — shrinks to 60% on desktop when panel is open */}
      <div className={cn('flex min-h-0 flex-1 flex-col', panel.open && 'lg:w-[60%]')}>
        <Header
          role={role}
          onChangeRole={() => setChangeRoleOpen(true)}
          onNewConversation={handleNewConversation}
          onSignOut={handleSignOutRequest}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {isEmpty && <Greeting role={role} />}
            <MessageList
              messages={state.messages}
              inFlightId={state.inFlightId}
              role={role}
              contentStewardEmail={config?.contentStewardEmail ?? 'kb-knowledge-team@mmc.com'}
              onCopy={() => { /* copy handled internally by AssistantControls */ }}
              onFeedback={handleFeedback}
              onRetry={(id) => { void handleRetry(id) }}   // consumes Plan 04's onRetry prop (no mutation)
              onChipClick={panel.chipClick}
              activeSource={panel.loaded}
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
      </div>
      <ChangeRoleDialog
        open={changeRoleOpen}
        onOpenChange={setChangeRoleOpen}
        onConfirm={handleConfirmChangeRole}
      />
      {/* Sign-out confirm — same dialog component, parameterised copy. Plan
          05-04 chose parameterisation over a sibling SignOutDialog.tsx
          because a sibling would share 100% of the structure. */}
      <ChangeRoleDialog
        open={signOutConfirmOpen}
        onOpenChange={setSignOutConfirmOpen}
        onConfirm={handleConfirmSignOut}
        title="Sign out?"
        description="This will clear this conversation. Your draft is also discarded."
        confirmLabel="Sign out and clear"
      />
      {/* Source panel — desktop persistent pane, mobile overlay drawer */}
      <SourcePanel
        open={panel.open}
        loaded={panel.loaded}
        onClose={panel.closePanel}
      />
    </div>
  )
}
