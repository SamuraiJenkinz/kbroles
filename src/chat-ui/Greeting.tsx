'use client'
import type { Role } from './types'

const GREETING: Record<Role, string> = {
  consumer:
    "Hi — I'm your KB assistant for flagging articles, leaving feedback, and navigating the CTSS knowledge workflow. Ask me something or pick a starter below.",
  author:
    "Hi — I'm your KB assistant for authoring and publishing articles. Ask about form fields, section anchors, or pick a starter below.",
}

export function Greeting({ role }: { role: Role }) {
  return (
    <section
      aria-label="Welcome"
      className="mx-auto my-6 max-w-2xl rounded-xl border border-neutral-border bg-neutral-card p-5 shadow-sm"
    >
      <p className="text-sm">{GREETING[role]}</p>
    </section>
  )
}
