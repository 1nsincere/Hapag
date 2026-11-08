'use client'

/**
 * Applies the restaurant's brand colour + light/dark choice (Admin → Settings)
 * to the customer screens, live. The last theme is cached so the next visit
 * paints in the right colour immediately (see THEME_BOOT_SCRIPT in layout).
 */
import { useEffect } from 'react'
import { listenToSettings } from '@/lib/data'
import { buildBrandTheme } from '@/lib/theme'

export const THEME_CACHE_KEY = 'hapag_theme_v1'

export function applyBrandTheme(brandColor?: string, themeMode?: string) {
  const theme = buildBrandTheme(brandColor, themeMode)
  const root = document.documentElement
  for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v)
  root.dataset.hpTheme = theme.mode
  // Phone browser chrome matches the page
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', theme.mode === 'dark' ? '#0B0A08' : '#FBF7F1')
  return theme
}

export default function ThemeSync() {
  useEffect(() => listenToSettings(s => {
    const theme = applyBrandTheme(s.brandColor, s.themeMode)
    try { localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ mode: theme.mode, vars: theme.vars })) } catch { /* private mode */ }
  }), [])
  return null
}

/** Runs before first paint: re-applies the cached theme (no colour flash). */
export const THEME_BOOT_SCRIPT = `try{var t=JSON.parse(localStorage.getItem('${THEME_CACHE_KEY}')||'null');if(t&&t.vars){var r=document.documentElement;for(var k in t.vars)r.style.setProperty(k,t.vars[k]);r.dataset.hpTheme=t.mode}}catch(e){}`
