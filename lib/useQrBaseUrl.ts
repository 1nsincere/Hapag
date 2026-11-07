'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

/**
 * The address table QR codes should point to — no setup needed:
 *   1. Admin typed one in Settings → use it (e.g. a custom domain)
 *   2. App is online (not localhost) → use the site's own address
 *   3. Testing on this computer → use its local-network IP (phones can't open "localhost")
 */
export type QrBaseSource = 'manual' | 'invalid' | 'site' | 'lan' | 'detecting' | 'unavailable'

/** Typos like "http:// 192.168.1.5:3000" silently break every QR code — clean them up */
export function cleanBaseUrl(raw?: string) {
  return (raw ?? '').replace(/\s+/g, '').replace(/\/+$/, '')
}

export function isValidBaseUrl(url: string) {
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname
  } catch {
    return false
  }
}

const noop = () => () => {}
const getOrigin = () => window.location.origin
const getHostname = () => window.location.hostname

export function useQrBaseUrl(configured?: string) {
  const origin = useSyncExternalStore(noop, getOrigin, () => '')
  const hostname = useSyncExternalStore(noop, getHostname, () => '')
  const cleaned = cleanBaseUrl(configured)
  const invalid = !!cleaned && !isValidBaseUrl(cleaned)
  const manual = invalid ? '' : cleaned
  const isLocal = /^(localhost|127\.|\[?::1\]?$)/.test(hostname)
  const needLan = !manual && isLocal

  const [lan, setLan] = useState<string[] | null>(null)
  useEffect(() => {
    if (!needLan) return
    let cancelled = false
    fetch('/api/network')
      .then(r => (r.ok ? r.json() : { addresses: [] }))
      .then(d => { if (!cancelled) setLan(Array.isArray(d.addresses) ? d.addresses : []) })
      .catch(() => { if (!cancelled) setLan([]) })
    return () => { cancelled = true }
  }, [needLan])

  let base = ''
  let source: QrBaseSource
  if (manual) { base = manual; source = 'manual' }
  else if (invalid) { base = isLocal ? (lan?.[0] ?? '') : origin; source = 'invalid' }
  else if (!isLocal) { base = origin; source = 'site' }
  else if (lan === null) { source = 'detecting' }
  else if (lan.length) { base = lan[0]; source = 'lan' }
  else { base = origin; source = 'unavailable' }

  return { base, source, candidates: lan ?? [] }
}
