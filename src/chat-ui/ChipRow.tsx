'use client'
import type { ChipItem } from './types'

export function ChipRow({
  chips,
  onChip,
  disabled = false,
}: {
  chips: ChipItem[]
  onChip: (text: string) => void
  disabled?: boolean
}) {
  if (chips.length === 0) return null
  return (
    <div
      className="flex flex-wrap gap-2 px-4 py-2 md:flex-nowrap md:overflow-x-auto"
      role="list"
    >
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          role="listitem"
          disabled={disabled}
          onClick={() => onChip(chip.text)}
          className="shrink-0 rounded-full border border-neutral-border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
