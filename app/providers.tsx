'use client'

import { SessionProvider } from 'next-auth/react'
import ThemeSync from './components/ThemeSync'
import DemoChrome from './components/DemoChrome'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeSync />
      {children}
      <DemoChrome />
    </SessionProvider>
  )
}
