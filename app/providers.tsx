'use client'

import { SessionProvider } from 'next-auth/react'
import ThemeSync from './components/ThemeSync'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeSync />
      {children}
    </SessionProvider>
  )
}
