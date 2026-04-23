import type { ReactNode } from 'react'
import { Providers } from './providers'
import './globals.css'

export const metadata = {
  title: 'KB Assistant',
  description: 'Ask about KB articles, flagging, feedback, and the CTSS knowledge workflow.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
