import type { Metadata, Viewport } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import './globals.css'
import './hapag.css'
import Providers from './providers'
import { THEME_BOOT_SCRIPT } from './components/ThemeSync'

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
  themeColor: '#FBF7F1',
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
    // suppressHydrationWarning: the theme boot script sets the brand colour on <html> before React loads
    <html lang="en" className={`${display.variable} ${body.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Apply the restaurant's cached brand theme before first paint (no colour flash) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
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
