'use client'

/**
 * Landing page sound effects, synthesised with Web Audio (no files to load).
 * Off by default; the visitor turns it on with the nav toggle (a user gesture,
 * which browsers require before any audio). The choice is remembered locally.
 */
const KEY = 'hapag_lp_sound'
let enabled = false
let ctx: AudioContext | null = null
const listeners = new Set<() => void>()

try { enabled = typeof window !== 'undefined' && localStorage.getItem(KEY) === 'on' } catch { /* storage blocked */ }

export function subscribeSound(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
export const getSound = () => enabled
export const getSoundServer = () => false

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export function setSound(on: boolean) {
  enabled = on
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* storage blocked */ }
  listeners.forEach(l => l())
  if (on) { audio(); bell(0.5) } // confirm with a soft ding (this click is the required gesture)
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Short soft click (swatches, toggles) */
export function tick() {
  const a = enabled && audio(); if (!a) return
  const t = a.currentTime
  const o = a.createOscillator(); const g = a.createGain()
  o.type = 'sine'; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.04)
  g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.07)
}

/** Kitchen service bell: a few bright partials with a long, gentle decay */
export function bell(volume = 1) {
  const a = enabled && audio(); if (!a) return
  const t = a.currentTime
  const out = a.createGain(); out.gain.value = 0.12 * volume; out.connect(a.destination)
  ;[[1568, 1], [3136, 0.35], [4704, 0.18], [2350, 0.25]].forEach(([f, v]) => {
    const o = a.createOscillator(); const g = a.createGain()
    o.type = 'sine'; o.frequency.value = f
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
    o.connect(g).connect(out); o.start(t); o.stop(t + 1.7)
  })
}

/** Thermal printer: a buzzing line-feed rhythm over a soft motor hum, about a second long */
export function printer() {
  const a = enabled && audio(); if (!a || reducedMotion()) return
  const t = a.currentTime
  const dur = 1.05
  // noise source
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const noise = a.createBufferSource(); noise.buffer = buf
  const band = a.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 2600; band.Q.value = 1.4
  const g = a.createGain(); g.gain.setValueAtTime(0, t)
  // line-by-line bursts
  const lines = 14
  for (let i = 0; i < lines; i++) {
    const s = t + i * (dur / lines)
    g.gain.setValueAtTime(0.0001, s)
    g.gain.linearRampToValueAtTime(0.05, s + 0.012)
    g.gain.exponentialRampToValueAtTime(0.004, s + dur / lines - 0.005)
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  noise.connect(band).connect(g).connect(a.destination)
  noise.start(t); noise.stop(t + dur)
  // motor hum
  const m = a.createOscillator(); const mg = a.createGain()
  m.type = 'triangle'; m.frequency.value = 118
  mg.gain.setValueAtTime(0, t); mg.gain.linearRampToValueAtTime(0.025, t + 0.05); mg.gain.setValueAtTime(0.025, t + dur - 0.08); mg.gain.linearRampToValueAtTime(0, t + dur)
  m.connect(mg).connect(a.destination); m.start(t); m.stop(t + dur + 0.02)
}
