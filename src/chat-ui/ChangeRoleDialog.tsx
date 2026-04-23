'use client'
import * as Dialog from '@radix-ui/react-dialog'

export function ChangeRoleDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content
          aria-describedby="change-role-desc"
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl"
        >
          <Dialog.Title className="text-lg font-semibold">Change role?</Dialog.Title>
          <Dialog.Description id="change-role-desc" className="mt-2 text-sm text-neutral-muted">
            This will clear this conversation. Your draft is also discarded.
          </Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                autoFocus
                className="rounded-md border border-neutral-border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={() => {
                onConfirm()
                onOpenChange(false)
              }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white"
            >
              Change role and clear
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
