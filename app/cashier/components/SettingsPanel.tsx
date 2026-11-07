'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Transaction } from '@/app/cashier/context/CartContext'
import { signOut as nextAuthSignOut } from 'next-auth/react'
import { signOut as firebaseSignOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  recentTransactions: Transaction[]
}

// Stable staff list (in a real app this would come from auth/Firebase)
const STAFF_LIST = ['Maria Santos', 'Juan dela Cruz', 'Ana Reyes', 'Carlo Mendoza']

export function SettingsPanel({ open, onClose, recentTransactions }: SettingsPanelProps) {
  const [cashierName, setCashierName] = useState<string>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('cashierName') ?? STAFF_LIST[0]
    return STAFF_LIST[0]
  })
  const [showSwitchStaff, setShowSwitchStaff] = useState(false)
  const [printerEnabled, setPrinterEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('printerEnabled') !== 'false'
    return true
  })
  const panelRef = useRef<HTMLDivElement>(null)

  // Persist settings
  useEffect(() => {
    localStorage.setItem('cashierName', cashierName)
  }, [cashierName])

  useEffect(() => {
    localStorage.setItem('printerEnabled', String(printerEnabled))
  }, [printerEnabled])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    // Slight delay so the opening click doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [open, onClose])

  // Shift summary
  const shiftTotal = recentTransactions.reduce((sum, t) => sum + t.total, 0)
  const shiftOrders = recentTransactions.length
  const avgOrder = shiftOrders > 0 ? shiftTotal / shiftOrders : 0

  const handleEndShift = async () => {
    const confirmed = window.confirm(
      `End shift for ${cashierName}?\n\nShift summary:\n• Orders: ${shiftOrders}\n• Total sales: ₱${shiftTotal.toFixed(2)}\n\nYou'll be signed out so the next cashier can log in.`
    )
    if (!confirmed) return
    // Sign out of both Firebase and the app session, then back to the login screen
    try { await firebaseSignOut(auth) } catch (e) { console.error('Firebase sign-out error', e) }
    await nextAuthSignOut({ callbackUrl: '/login' })
  }

  if (!open) return null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    // Positioned relative to the gear icon — uses a fixed dropdown card
    <div
      ref={panelRef}
      className="fixed top-16 right-4 w-80 bg-white rounded-2xl shadow-2xl border border-surface-container-low z-50 overflow-hidden"
      style={{ maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}
    >
      {/* Cashier Section */}
      <div className="px-4 py-4 border-b border-surface-container-low">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">
                {cashierName.split(' ').map(w => w[0]).join('').slice(0, 2)}
              </span>
            </div>
            <div>
              <p className="font-semibold text-on-surface text-sm">{cashierName}</p>
              <p className="text-xs text-on-surface-variant">Active Cashier</p>
            </div>
          </div>
          <button
            onClick={() => setShowSwitchStaff(v => !v)}
            className="text-xs text-primary font-medium hover:underline"
          >
            Switch
          </button>
        </div>

        {/* Staff switcher */}
        {showSwitchStaff && (
          <div className="mt-3 space-y-1">
            {STAFF_LIST.map(name => (
              <button
                key={name}
                onClick={() => { setCashierName(name); setShowSwitchStaff(false) }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  name === cashierName
                    ? 'bg-primary text-white font-medium'
                    : 'hover:bg-surface-container-high text-on-surface'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Shift Summary */}
      <div className="px-4 py-3 border-b border-surface-container-low">
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">
          Current Shift
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-surface-container-low rounded-xl p-2.5 text-center">
            <p className="text-lg font-bold text-on-surface">{shiftOrders}</p>
            <p className="text-xs text-on-surface-variant">Orders</p>
          </div>
          <div className="bg-surface-container-low rounded-xl p-2.5 text-center">
            <p className="text-lg font-bold text-primary">₱{shiftTotal >= 1000 ? `${(shiftTotal / 1000).toFixed(1)}k` : shiftTotal.toFixed(0)}</p>
            <p className="text-xs text-on-surface-variant">Sales</p>
          </div>
          <div className="bg-surface-container-low rounded-xl p-2.5 text-center">
            <p className="text-lg font-bold text-on-surface">₱{avgOrder.toFixed(0)}</p>
            <p className="text-xs text-on-surface-variant">Avg.</p>
          </div>
        </div>
      </div>

      {/* Settings Toggles */}
      <div className="px-4 py-3 border-b border-surface-container-low space-y-3">
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Preferences</p>

        {/* Printer toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">print</span>
            <span className="text-sm text-on-surface">Receipt Printer</span>
          </div>
          {/* Native toggle switch */}
          <button
            role="switch"
            aria-checked={printerEnabled}
            onClick={() => setPrinterEnabled(v => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
              printerEnabled ? 'bg-primary' : 'bg-surface-container-highest'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              printerEnabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {/* Printer status hint */}
        <p className="text-xs text-on-surface-variant pl-7">
          {printerEnabled ? 'Receipts will print after each sale' : 'Printer is disabled — digital receipt only'}
        </p>
      </div>

      {/* Quick Links */}
      <div className="px-4 py-3 border-b border-surface-container-low space-y-1">
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">Quick Links</p>

        <Link
          href="/admin"
          onClick={onClose}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-on-surface-variant text-lg">admin_panel_settings</span>
          <span className="text-sm text-on-surface">System Settings</span>
          <span className="material-symbols-outlined text-on-surface-variant text-sm ml-auto">open_in_new</span>
        </Link>

        <Link
          href="/kitchen"
          onClick={onClose}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-on-surface-variant text-lg">soup_kitchen</span>
          <span className="text-sm text-on-surface">Kitchen Display</span>
          <span className="material-symbols-outlined text-on-surface-variant text-sm ml-auto">open_in_new</span>
        </Link>
      </div>

      {/* End Shift */}
      <div className="px-4 py-3">
        <button
          onClick={handleEndShift}
          className="w-full py-2.5 flex items-center justify-center gap-2 text-error font-semibold text-sm rounded-xl hover:bg-error-container transition-colors border border-error/20"
        >
          <span className="material-symbols-outlined text-lg">logout</span>
          End Shift / Logout
        </button>
      </div>
    </div>
  )
}
