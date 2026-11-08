'use client'

/**
 * Admin → Settings → Brand look. Pick a preset or any colour + light/dark;
 * shows a live mini customer screen and checks text contrast automatically.
 */
import type { CSSProperties } from 'react'
import { THEME_PRESETS, DEFAULT_BRAND_COLOR, buildBrandTheme, normalizeHex, type ThemeMode } from '@/lib/theme'

export default function BrandThemeCard({ color, mode, restaurantName, onChange }: {
  color?: string
  mode?: string
  restaurantName: string
  onChange: (next: { brandColor: string; themeMode: ThemeMode }) => void
}) {
  const current = normalizeHex(color) ?? DEFAULT_BRAND_COLOR
  const currentMode: ThemeMode = mode === 'dark' ? 'dark' : 'light'
  const theme = buildBrandTheme(current, currentMode)
  const activePreset = THEME_PRESETS.find(p => p.color === current && p.mode === currentMode)

  const ok = (n: number) => n >= 4.5
  return (
    <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-sm space-y-5">
      <div>
        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Brand look (customer screens)</label>
        <p className="text-xs text-zinc-500">Pick the restaurant&apos;s colour. Buttons, prices and highlights follow it — shades and readable text are worked out automatically.</p>
      </div>

      {/* Presets */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {THEME_PRESETS.map(p => {
          const selected = activePreset?.id === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ brandColor: p.color, themeMode: p.mode })}
              aria-pressed={selected}
              className={`text-left rounded-xl border p-2.5 transition-colors ${selected ? 'border-zinc-900 ring-2 ring-zinc-900/10' : 'border-zinc-200 hover:border-zinc-400'}`}
            >
              <span className="flex items-center gap-2">
                <span
                  className="w-7 h-7 rounded-full shrink-0 border border-black/10"
                  style={{ background: p.mode === 'dark' ? `radial-gradient(circle at 35% 35%, ${p.color} 0 38%, #0B0A08 40%)` : p.color }}
                />
                <span className="text-sm font-semibold text-zinc-900">{p.name}</span>
              </span>
              <span className="block text-[11px] text-zinc-500 mt-1 leading-snug">{p.hint}</span>
            </button>
          )
        })}
      </div>

      {/* Custom colour + mode */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Custom colour</span>
          <span className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={current}
              onChange={e => onChange({ brandColor: e.target.value.toUpperCase(), themeMode: currentMode })}
              className="w-11 h-11 rounded-lg border border-zinc-200 cursor-pointer bg-white p-1"
              aria-label="Pick a brand colour"
            />
            <input
              defaultValue={current}
              key={current}
              onBlur={e => { const hex = normalizeHex(e.target.value); if (hex) onChange({ brandColor: hex, themeMode: currentMode }) }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="w-28 h-11 px-3 rounded-lg border border-zinc-200 bg-zinc-50 font-mono text-sm uppercase"
              aria-label="Brand colour hex code"
              placeholder="#C8510F"
            />
          </span>
        </label>
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Background</span>
          <div className="mt-1 flex bg-zinc-100 rounded-lg p-1" role="radiogroup" aria-label="Background">
            {(['light', 'dark'] as const).map(m => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={currentMode === m}
                onClick={() => onChange({ brandColor: current, themeMode: m })}
                className={`h-9 px-4 rounded-md text-sm font-semibold flex items-center gap-1.5 ${currentMode === m ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}
              >
                <span className="material-symbols-outlined text-[18px]">{m === 'light' ? 'light_mode' : 'dark_mode'}</span>
                {m === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="grid sm:grid-cols-[minmax(0,1fr)_200px] gap-4 items-start">
        <div className="hp hp-preview p-5" data-hp-theme={currentMode} style={theme.vars as CSSProperties}>
          <p className="hp-eyebrow">À la carte</p>
          <p className="hp-title" style={{ fontSize: '1.6rem', marginTop: 6 }}>{restaurantName || 'Your restaurant'}</p>
          <div className="hp-dish" style={{ gridTemplateColumns: '1fr 72px', padding: '14px 0', cursor: 'default' }}>
            <div className="hp-dish-text">
              <span className="hp-badge">Bestseller</span>
              <h3 className="hp-dish-name" style={{ fontSize: '1.15rem' }}>Kare-Kare</h3>
              <span className="hp-price">₱485.00</span>
            </div>
            <div className="hp-dish-media" style={{ width: 72, height: 72 }}>
              <div className="hp-img hp-img-fallback" style={{ width: 72, height: 72, borderRadius: 14 }}><span className="hp-img-initial">K</span></div>
              <span className="hp-add" style={{ width: 32, height: 32 }} aria-hidden="true"><span className="material-symbols-outlined">add</span></span>
            </div>
          </div>
          <button type="button" className="hp-btn hp-btn-primary hp-btn-block" style={{ marginTop: 14 }}>Send order</button>
        </div>
        <div className="space-y-2 text-xs">
          <p className="font-bold text-zinc-700">Readability check</p>
          <p className={`flex items-center gap-1.5 ${ok(theme.report.buttonText) ? 'text-emerald-700' : 'text-amber-700'}`}>
            <span className="material-symbols-outlined text-[16px]">{ok(theme.report.buttonText) ? 'check_circle' : 'warning'}</span>
            Button text {theme.report.buttonText.toFixed(1)}:1
          </p>
          <p className={`flex items-center gap-1.5 ${ok(theme.report.accentText) ? 'text-emerald-700' : 'text-amber-700'}`}>
            <span className="material-symbols-outlined text-[16px]">{ok(theme.report.accentText) ? 'check_circle' : 'warning'}</span>
            Prices &amp; links {theme.report.accentText.toFixed(1)}:1
          </p>
          <p className="text-zinc-400 leading-snug">4.5:1 or more is easy to read (WCAG AA). Shades are adjusted automatically to keep it there.</p>
        </div>
      </div>
    </div>
  )
}
