import type { Metadata, Viewport } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import './globals.css'
import './hapag.css'
import Providers from './providers'

// Customer-facing brand fonts (Hapag Noir). Self-hosted by next/font — no
// render-blocking request to Google at runtime.
const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-hp-display',
  display: 'swap',
})
const body = Manrope({
  subsets: ['latin'],
  variable: '--font-hp-body',
  display: 'swap',
})

// Static metadata — restaurant name is loaded client-side via listenToSettings
export const metadata: Metadata = {
  title: 'Hapag — QR Ordering for Restaurants',
  description: 'Hapag — scan, order and pay from your table. Smart QR ordering and POS for restaurants.',
}

export const viewport: Viewport = {
  themeColor: '#0b0a08',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

const ICONS_URL =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,300..500,0..1,0&display=block'
const STAFF_FONT_URL =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Staff screens font + icon font (icons use display=block so ligature names never flash) */}
        <link href={STAFF_FONT_URL} rel="stylesheet" />
        <link href={ICONS_URL} rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
