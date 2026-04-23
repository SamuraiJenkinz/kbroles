'use client'
import { ShieldOff } from 'lucide-react'
import { useConfig } from '@/chat-ui/useConfig'

/**
 * App-Role-missing full-page block. Phase 5.1's session-cookie auth middleware
 * (src/app/api/_middleware.ts) + the /api/me client guard route authenticated
 * users here when their Entra session is valid but they lack the
 * `KbAssistant.User` App Role assignment — i.e. Entra recognises who they
 * are but MMC IT hasn't granted this specific pilot access yet.
 *
 * Phase 5's original "wrong tenant" framing was dropped in 5.1 because the
 * BFF pattern uses a single-tenant confidential-client app (MMC-only token
 * issuance is guaranteed by the Entra app registration; we never see a
 * cross-tenant token at the session-cookie layer). The failure mode now
 * reaching this page is App-Role gating only.
 *
 * CONTEXT §Blocked-user UX invariant: leak NO Entra claims, object IDs,
 * tenant IDs, or technical detail. Mailto uses contentStewardEmail from
 * /api/config (same source as the Phase-4 FallbackCard's flag-a-gap button).
 *
 * Phase 5.1 — Plan 04 Task 2.
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
        Your MMC account doesn&apos;t have access to this assistant yet. Contact the CTSS Knowledge team to request access.
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
