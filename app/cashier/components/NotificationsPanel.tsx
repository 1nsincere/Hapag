'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { listenToOrders, Order } from '@/lib/data'

// ── Types ─────────────────────────────────────────────────────────────────────

type NotifType = 'new_order' | 'order_ready' | 'payment_done' | 'bill_request'

interface Notification {
  id: string
  type: NotifType
  title: string
  body: string
  timestamp: Date
  read: boolean
}

interface NotificationsPanelProps {
  open: boolean
  onClose: () => void
  onUnreadChange: (count: number) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function iconFor(type: NotifType) {
  switch (type) {
    case 'new_order':    return { icon: 'receipt_long',   bg: 'bg-blue-100',   text: 'text-blue-600' }
    case 'order_ready':  return { icon: 'check_circle',   bg: 'bg-green-100',  text: 'text-green-600' }
    case 'payment_done': return { icon: 'payments',       bg: 'bg-primary/10', text: 'text-primary' }
    case 'bill_request': return { icon: 'request_quote',  bg: 'bg-amber-100',  text: 'text-amber-600' }
  }
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60)   return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NotificationsPanel({ open, onClose, onUnreadChange }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  // Track which order/table IDs we've already emitted notifications for
  const seenOrders = useRef<Set<string>>(new Set())
  const isFirstLoad = useRef(true)

  // Push a new notification (fires only for truly new events, not on initial snapshot)
  const push = useCallback((n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const notif: Notification = {
      ...n,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      read: false,
    }
    setNotifications(prev => [notif, ...prev].slice(0, 50))
  }, [])

  // Subscribe to orders — detect new orders and ready status changes
  useEffect(() => {
    const unsub = listenToOrders((orders: Order[]) => {
      if (isFirstLoad.current) {
        // Seed seen set on first load — don't emit stale notifications
        orders.forEach(o => seenOrders.current.add(`${o.id}:${o.status}`))
        isFirstLoad.current = false
        return
      }
      orders.forEach(o => {
        const pendingKey = `${o.id}:pending`
        const newKey  = `${o.id}:new`
        const readyKey = `${o.id}:ready`
        const itemCount = `${o.items.length} item${o.items.length !== 1 ? 's' : ''}`
        // Customer sent an order — this is the step that needs the cashier
        if (o.status === 'pending' && !seenOrders.current.has(pendingKey)) {
          seenOrders.current.add(pendingKey) // sound comes from the bottom-left alert cards
          push({
            type: 'new_order',
            title: 'Order needs accepting',
            body: `Table ${o.tableNumber} sent an order (${itemCount})`,
          })
        }
        // Order paid and sent to the kitchen (customer checkout or walk-in)
        if (o.status === 'preparing' && !seenOrders.current.has(newKey)) {
          seenOrders.current.add(newKey)
          push({
            type: 'payment_done',
            title: o.tableNumber ? 'Paid — sent to kitchen' : 'Takeout paid — sent to kitchen',
            body: o.tableNumber ? `Table ${o.tableNumber} (${itemCount})` : itemCount,
          })
        }
        // Order marked ready by kitchen
        if (o.status === 'ready' && !seenOrders.current.has(readyKey)) {
          seenOrders.current.add(readyKey)
          push({
            type: 'order_ready',
            title: 'Order Ready',
            body: `Table ${o.tableNumber}'s order is ready for pickup`,
          })
        }
      })
    })
    return unsub
  }, [push])

  // Keep parent badge count in sync
  useEffect(() => {
    const unread = notifications.filter(n => !n.read).length
    onUnreadChange(unread)
  }, [notifications, onUnreadChange])

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const clearAll = () => setNotifications([])

  const unreadCount = notifications.filter(n => !n.read).length

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={onClose}
        />
      )}

      {/* Slide-out panel */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-container-low">
          <div>
            <h2 className="font-bold text-on-surface text-lg">Notifications</h2>
            {unreadCount > 0 && (
              <p className="text-xs text-on-surface-variant">{unreadCount} unread</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary font-medium hover:underline"
              >
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-on-surface-variant hover:text-error font-medium"
              >
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-surface-container-high rounded-lg transition-colors ml-2"
            >
              <span className="material-symbols-outlined text-on-surface-variant">close</span>
            </button>
          </div>
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <span className="material-symbols-outlined text-on-surface-variant mb-3" style={{ fontSize: 48 }}>
                notifications_none
              </span>
              <p className="font-medium text-on-surface-variant">All caught up!</p>
              <p className="text-sm text-outline mt-1">New orders and alerts will appear here</p>
            </div>
          ) : (
            <ul>
              {notifications.map(n => {
                const { icon, bg, text } = iconFor(n.type)
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => markRead(n.id)}
                      className={`w-full flex items-start gap-3 px-5 py-4 border-b border-surface-container-low text-left transition-colors hover:bg-surface-container-low ${
                        !n.read ? 'bg-primary/5' : ''
                      }`}
                    >
                      {/* Icon pill */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
                        <span className={`material-symbols-outlined text-lg ${text}`}>{icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-semibold ${n.read ? 'text-on-surface-variant' : 'text-on-surface'}`}>
                            {n.title}
                          </p>
                          <span className="text-xs text-outline flex-shrink-0">{timeAgo(n.timestamp)}</span>
                        </div>
                        <p className="text-sm text-on-surface-variant mt-0.5 leading-snug">{n.body}</p>
                      </div>
                      {/* Unread dot */}
                      {!n.read && (
                        <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
