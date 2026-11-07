/**
 * Two-note alert chime synthesised with the Web Audio API — no audio file to
 * ship or lose. Browsers only allow sound after the user has interacted with
 * the page once (any click/tap on the staff screen is enough).
 */
let ctx: AudioContext | null = null

export function playChime() {
  try {
    if (typeof window === 'undefined') return
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    const start = ctx.currentTime
    ;[880, 1318.5].forEach((freq, i) => {
      const t = start + i * 0.16
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(t)
      osc.stop(t + 0.75)
    })
  } catch {
    /* audio unavailable — visual alerts still work */
  }
}
