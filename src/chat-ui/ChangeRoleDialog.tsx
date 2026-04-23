'use client'
import * as Dialog from '@radix-ui/react-dialog'

/**
 * Confirm dialog for destructive flows that would discard chat state + draft.
 *
 * Named `ChangeRoleDialog` for historical reasons (Phase 3 shipped it for
 * the role-change confirm), but the shape is now reused for any flow that
 * clears in-memory chat state — Plan 05-04 reuses it for the sign-out
 * confirm. Optional props override the default copy; keeping one component
 * avoids a structural duplicate (`SignOutDialog` would have the same tree).
 *
 * Phase 3 defaults → Phase 5 Plan 05-04 parameterised for sign-out reuse.
 */
export function ChangeRoleDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Change role?',
  description = 'This will clear this conversation. Your draft is also discarded.',
  confirmLabel = 'Change role and clear',
  cancelLabel = 'Cancel',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onConfirm: () => void
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content
          aria-describedby="change-role-desc"
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl"
        >
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Description id="change-role-desc" className="mt-2 text-sm text-neutral-muted">
            {description}
          </Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                autoFocus
                className="rounded-md border border-neutral-border px-3 py-1.5 text-sm"
              >
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              onClick={() => {
                onConfirm()
                onOpenChange(false)
              }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white"
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
