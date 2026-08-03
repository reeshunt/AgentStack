let audioCtx: AudioContext | null = null

/** Synthesizes a short two-note "bell" ding via Web Audio — no bundled asset,
 *  no CSP media-src concerns, just an oscillator. Used to notify the user
 *  that an agent finished its work. */
export function playBellSound(): void {
  try {
    const ctx = audioCtx ?? new AudioContext()
    audioCtx = ctx
    const now = ctx.currentTime

    const playTone = (freq: number, start: number, duration: number, gain: number): void => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      g.gain.setValueAtTime(0, now + start)
      g.gain.linearRampToValueAtTime(gain, now + start + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + duration)
      osc.connect(g)
      g.connect(ctx.destination)
      osc.start(now + start)
      osc.stop(now + start + duration + 0.05)
    }

    playTone(1318.5, 0, 0.18, 0.18) // E6
    playTone(1760, 0.09, 0.22, 0.15) // A6
  } catch {
    // Audio isn't critical to the feature — ignore playback failures
    // (e.g. autoplay policy blocking sound before any user gesture).
  }
}
