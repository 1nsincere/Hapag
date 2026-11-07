import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'

// Static metadata — restaurant name is loaded client-side via listenToSettings
export const metadata: Metadata = {
  title: 'Hapag — QR Ordering for Restaurants',
  description: 'Hapag — scan, order and pay from your table. Smart QR ordering and POS for restaurants.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to reduce DNS + TLS handshake time */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Preload the font CSS so it doesn't block rendering */}
        <link
          rel="preload"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          as="style"
        />
        <link
          rel="preload"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
          as="style"
        />

        {/* Load fonts — display=swap prevents invisible text during load */}
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
