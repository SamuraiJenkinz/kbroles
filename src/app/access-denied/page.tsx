'use client'
import { ShieldOff } from 'lucide-react'
import { useConfig } from '@/chat-ui/useConfig'

/**
 * Wrong-tenant full-page block. Phase-5 auth middleware (Plan 03) + Phase-5
 * AuthProvider (Plan 04) both redirect users here when a JWT's `tid` is
 * valid-but-not-MMC or when an NAA sign-in surfaces a non-allowlisted tenant.
 *
 * CONTEXT §Blocked-user UX invariant: leak NO JWT claims, tenant IDs, or
 * technical detail. Mailto uses contentStewardEmail from /api/config (same
 * source as the Phase-4 FallbackCard's flag-a-gap button).
 *
 * Phase 5 — Plan 05-02 Task 1.
 */
export default function AccessDeniedPage() {
  const { config } = useConfig()
  const email = config?.contentStewardEmail ?? 'kb-knowledge-team@mmc.com'
  const subject = encodeURIComponent('KB Assistant — access request')
  const body = encodeURIComponent(
    "Hi CTSS Knowledge team,\n\nI'm trying to access the KB Assistant but was blocked. Please let me know if there's a way for me to use it.\n\nThanks.",
  )
  const mailto = `mailto:${email}?subject=${subject}&body=${body}`

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
      <ShieldOff size={48} className="text-red-600" aria-hidden />
      <h1 className="text-2xl font-semibold text-neutral-900">Access restricted</h1>
      <p className="text-sm text-neutral-600">
        This assistant is available only to MMC colleagues. If you believe this is an error, contact the CTSS Knowledge team.
      </p>
      <a
        href={mailto}
        className="mt-2 rounded-md border border-neutral-border px-4 py-2 text-sm hover:bg-neutral-50"
      >
        Contact CTSS Knowledge team
      </a>
    </main>
  )
}
