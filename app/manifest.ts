import type { MetadataRoute } from 'next'

/**
 * Makes Hapag installable ("Add to Home screen" / "Install app").
 * The installed app opens on the staff login, which sends each person to
 * their own screen (owner → admin, cashier → cashier, kitchen → kitchen).
 * Guests keep using the QR code in their browser; they don't install anything.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/login',
    name: 'Hapag',
    short_name: 'Hapag',
    description: 'QR ordering, cashier and kitchen screens for your restaurant.',
    start_url: '/login?source=app',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#0F2B1F',
    theme_color: '#0F2B1F',
    categories: ['business', 'food', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Cashier', url: '/cashier', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Kitchen', url: '/kitchen', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Admin', url: '/admin', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
