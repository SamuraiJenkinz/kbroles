'use client'
import { User, Pencil } from 'lucide-react'
import type { Role } from './types'
import { cn } from './cn'

export function RoleSelect({ onPick }: { onPick: (role: Role) => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl items-center justify-center p-6">
      <section aria-labelledby="role-select-heading" className="w-full">
        <h1 id="role-select-heading" className="mb-2 text-center text-2xl font-semibold">
          Who are you today?
        </h1>
        <p className="mb-8 text-center text-sm text-neutral-muted">
          Pick the experience that matches what you want to do.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <RoleCard
            label="Knowledge Consumer"
            description="Find answers about KB articles, flagging, and feedback workflows."
            accent="consumer"
            icon={<User size={22} aria-hidden />}
            onClick={() => onPick('consumer')}
          />
          <RoleCard
            label="KB Author / SME"
            description="Get help with KB form fields, section anchors, and publishing."
            accent="author"
            icon={<Pencil size={22} aria-hidden />}
            onClick={() => onPick('author')}
          />
        </div>
      </section>
    </main>
  )
}

function RoleCard({
  label,
  description,
  accent,
  icon,
  onClick,
}: {
  label: string
  description: string
  accent: 'consumer' | 'author'
  icon: React.ReactNode
  onClick: () => void
}) {
  const accentClasses =
    accent === 'consumer'
      ? 'border-consumer-600/40 bg-consumer-50'
      : 'border-author-600/40 bg-author-50'
  const iconClasses =
    accent === 'consumer' ? 'text-consumer-600' : 'text-author-600'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-3 rounded-xl border p-6 text-left shadow-sm transition',
        'hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2',
        accentClasses,
      )}
    >
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-full bg-white shadow-inner',
          iconClasses,
        )}
      >
        {icon}
      </span>
      <span className="text-lg font-semibold">{label}</span>
      <span className="text-sm text-neutral-muted">{description}</span>
    </button>
  )
}
