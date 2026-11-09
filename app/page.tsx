/**
 * Home.
 *  • Demo site (NEXT_PUBLIC_DEMO_MODE=true): the Hapag showcase landing page
 *  • Restaurant site: the restaurant's "scan the code on your table" welcome
 */
import type { Metadata } from 'next'
import { DEMO_MODE } from '@/lib/demo'
import Welcome from './components/Welcome'
import Landing from './components/landing/Landing'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  if (!DEMO_MODE) return {}
  // Absolute address for link previews (Facebook, LinkedIn, Messenger…)
  const site = process.env.NEXTAUTH_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')
  return {
    metadataBase: new URL(site),
    title: 'Hapag — Every table is a front door',
    description: 'QR ordering and POS for Filipino restaurants. Guests scan, order and pay from their seat; cashier, kitchen and owner see it the same second. Try the live demo.',
    openGraph: {
      title: 'Hapag — Every table is a front door',
      description: 'QR ordering and POS for Filipino restaurants. Try the live demo.',
      images: ['/landing/guest-menu.jpg'],
    },
  }
}

export default async function Home() {
  if (!DEMO_MODE) return <Welcome />

  let guestPath = '/menu/1'
  try {
    const { ensureDemoReady, demoInfo, refreshDemoClock } = await import('@/lib/server/demo')
    await ensureDemoReady()
    await refreshDemoClock().catch(e => console.error('[landing] demo clock', e))
    guestPath = (await demoInfo())?.guestPath ?? guestPath
  } catch (e) {
    console.error('[landing] demo setup', e)
  }
  return <Landing guestPath={guestPath} />
}
