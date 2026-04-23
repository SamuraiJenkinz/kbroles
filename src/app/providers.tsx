'use client'
import * as Tooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={100}>
      {children}
    </Tooltip.Provider>
  )
}
