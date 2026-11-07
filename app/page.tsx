'use client'

import { useState, useEffect } from 'react'
import { listenToSettings, AppSettings, DEFAULT_SETTINGS } from '@/lib/data'

export default function Home() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    return listenToSettings(setSettings)
  }, [])

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 flex flex-col items-center justify-center px-6 text-center">
      <div className="animate-fade-in max-w-sm">
        {/* Logo */}
        <div className="mb-8">
          <div className="w-20 h-20 bg-primary rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-primary/30">
            <span className="material-symbols-outlined text-white text-4xl">restaurant</span>
          </div>
          <h1 className="text-headline-lg font-black text-on-surface tracking-tight">{settings.restaurantName}</h1>
          <p className="text-body-md text-on-surface-variant mt-2">Table Ordering System</p>
        </div>

        {/* Scan instruction card */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-outline-variant/30">
          <span className="material-symbols-outlined text-primary text-6xl mb-4 block">qr_code_scanner</span>
          <h2 className="text-headline-md text-on-surface font-bold mb-3">Scan Your Table QR Code</h2>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            Look for the QR code on your table. Scan it with your phone&apos;s camera to start ordering — no app download needed.
          </p>
        </div>

        <p className="text-label-sm text-outline text-center mt-8">
          {settings.restaurantName} · Powered by Hapag
        </p>
      </div>
    </main>
  )
}
