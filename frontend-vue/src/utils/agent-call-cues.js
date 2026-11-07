// Local, quiet earcons. No network or AI request is used for call feedback.
const notes = { connecting: [440, 480], connected: [523, 784], listening: [660], sent: [660, 440], muted: [330], unmuted: [440, 660], ended: [440, 330], error: [220, 220] }
export function createCallCues(enabled = () => true) {
  let context, ringing, disposed = false
  const oscillators = new Set()
  function play(kind) {
    if (disposed || !enabled()) return
    try {
      context ||= new (window.AudioContext || window.webkitAudioContext)()
      context.resume().catch(() => {})
      for (const [index, frequency] of (notes[kind] || []).entries()) {
        const oscillator = context.createOscillator(), gain = context.createGain()
        const start = context.currentTime + index * 0.13
        oscillator.frequency.value = frequency
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.045, start + 0.012)
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1)
        oscillator.connect(gain); gain.connect(context.destination)
        oscillators.add(oscillator)
        oscillator.onended = () => { oscillators.delete(oscillator); oscillator.disconnect(); gain.disconnect() }
        oscillator.start(start); oscillator.stop(start + 0.12)
      }
    } catch { /* Visual state remains available if audio is blocked. */ }
  }
  return {
    play,
    ring() { this.stopRinging(); play('connecting'); ringing = setInterval(() => play('connecting'), 1800) },
    stopRinging() { clearInterval(ringing); ringing = null; for (const oscillator of oscillators) { try { oscillator.stop() } catch {} } },
    dispose() { disposed = true; clearInterval(ringing); for (const oscillator of oscillators) { try { oscillator.stop() } catch {} } context?.close().catch(() => {}) },
  }
}
