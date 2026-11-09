'use client'

import { SessionProvider } from 'next-auth/react'
import ThemeSync from './components/ThemeSync'
import DemoChrome from './components/DemoChrome'
import { ServiceWorker } from './components/AppInstall'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeSync />
      {children}
      <DemoChrome />
      <ServiceWorker />
    </SessionProvider>
  )
}
