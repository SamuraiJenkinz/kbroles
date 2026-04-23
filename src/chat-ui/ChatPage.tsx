'use client'
import { useRolePersistence } from './useRolePersistence'
import { RoleSelect } from './RoleSelect'
import { ChatSurface } from './ChatSurface'

export function ChatPage() {
  const { role, setRole, hydrated } = useRolePersistence()

  // Pitfall 4 (RESEARCH) — show a stable skeleton until hydration, so returning
  // users never see a flash of RoleSelect before sessionStorage loads.
  if (!hydrated) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
        <div className="h-24 w-full max-w-md animate-pulse rounded-xl bg-neutral-card shadow-sm" />
      </main>
    )
  }

  if (role == null) {
    return <RoleSelect onPick={setRole} />
  }
  return <ChatSurface role={role} onChangeRole={() => setRole(null)} />
}
