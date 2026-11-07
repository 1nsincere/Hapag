'use client'

import { useState, useEffect } from 'react'
import { listenToSettings, AppSettings, DEFAULT_SETTINGS } from '@/lib/data'
import { delay, PoweredBy } from '@/app/components/customer/ui'

export default function Home() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => listenToSettings(setSettings), [])

  return (
    <div className="hp hp-welcome">
      <div className="hp-glow" aria-hidden="true" />
      <div className="hp-frame" aria-hidden="true" />

      <main className="hp-welcome-content">
        <p className="hp-eyebrow hp-fade-up">Welcome to</p>
        <h1 className="hp-welcome-name hp-fade-up" style={delay(100)}>{settings.restaurantName}</h1>
        <div className="hp-ornament hp-fade-up" style={delay(200)}><i /></div>

        <div className="hp-fade-up" style={{ ...delay(320), marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div className="hp-orb"><span className="material-symbols-outlined">qr_code_scanner</span></div>
          <h2 className="hp-title-sm">Scan the code on your table</h2>
          <p className="hp-muted" style={{ maxWidth: 320 }}>
            Point your phone&apos;s camera at the QR code to browse the menu, order and pay — no app needed.
          </p>
        </div>
      </main>

      <PoweredBy inline={false} />
    </div>
  )
}
