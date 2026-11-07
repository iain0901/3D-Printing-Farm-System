import { afterEach, expect, it, vi } from 'vitest';
import { startAgentVoice } from '../frontend-vue/src/utils/agent-voice.js';
import { createCallCues } from '../frontend-vue/src/utils/agent-call-cues.js';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function fixture() {
  vi.useFakeTimers();
  let muted = false, busy = false;
  const tracks = [{ enabled: true, stop: vi.fn() }], recorders = [];
  const context = { resume: vi.fn(async () => {}), close: vi.fn(async () => {}), createMediaStreamSource: () => ({ connect() {} }), createAnalyser: () => ({ fftSize: 1024, getFloatTimeDomainData: values => values.fill(0) }) };
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => tracks })) } });
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  vi.stubGlobal('MediaRecorder', class {
    static isTypeSupported() { return true; }
    constructor() { recorders.push(this); this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['test-audio']) }); this.onstop?.(); }
  });
  const onAudio = vi.fn(async () => {}), onError = vi.fn();
  return { tracks, recorders, context, onAudio, setMuted: v => { muted = v; }, setBusy: v => { busy = v; }, start: () => startAgentVoice({ onAudio, onError, isMuted: () => muted, isBusy: () => busy }) };
}
it('waits for connection tones or an existing reply to finish before recording, and releases the device', async () => {
  const f = fixture(); f.setBusy(true);
  const session = await f.start();
  await vi.advanceTimersByTimeAsync(500);
  expect(f.recorders).toHaveLength(0);
  f.setBusy(false); await vi.advanceTimersByTimeAsync(100);
  expect(f.recorders).toHaveLength(1);
  session.stop(); await vi.advanceTimersByTimeAsync(1000);
  expect(f.onAudio).not.toHaveBeenCalled(); expect(f.tracks[0].stop).toHaveBeenCalledOnce(); expect(f.context.close).toHaveBeenCalledOnce();
});
it('discards muted speech, sends only a deliberate utterance, and does not upload silence', async () => {
  const f = fixture(); const session = await f.start();
  await vi.advanceTimersByTimeAsync(20100);
  expect(f.onAudio).not.toHaveBeenCalled();
  f.setMuted(true); session.setMuted(true); await vi.advanceTimersByTimeAsync(500);
  expect(f.tracks[0].enabled).toBe(false); expect(f.onAudio).not.toHaveBeenCalled();
  f.setMuted(false); session.setMuted(false); await vi.advanceTimersByTimeAsync(100);
  session.flush(); await vi.advanceTimersByTimeAsync(1);
  expect(f.onAudio).toHaveBeenCalledOnce(); session.stop();
});
it('stops ringing on cancellation and honors the sound switch without making requests', () => {
  vi.useFakeTimers(); const oscillator = () => ({ frequency: {}, connect() {}, disconnect() {}, start: vi.fn(), stop: vi.fn() });
  const audio = { currentTime: 0, destination: {}, resume: vi.fn(async () => {}), close: vi.fn(async () => {}), createOscillator: vi.fn(oscillator), createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }) };
  vi.stubGlobal('window', { AudioContext: class { constructor() { return audio; } } });
  let enabled = true; const cues = createCallCues(() => enabled);
  cues.ring(); expect(audio.createOscillator).toHaveBeenCalledTimes(2);
  cues.stopRinging(); vi.advanceTimersByTime(10000); expect(audio.createOscillator).toHaveBeenCalledTimes(2);
  enabled = false; cues.play('connected'); expect(audio.createOscillator).toHaveBeenCalledTimes(2);
  cues.dispose(); expect(audio.close).toHaveBeenCalledOnce();
});
it('releases a microphone granted after the user has already cancelled permission setup', async () => {
  const f = fixture(); const controller = new AbortController();
  let grant;
  navigator.mediaDevices.getUserMedia.mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
  const startup = startAgentVoice({ signal: controller.signal, onAudio: f.onAudio, onError: vi.fn(), isMuted: () => false, isBusy: () => false });
  const rejected = expect(startup).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort(); grant({ getTracks: () => f.tracks });
  await rejected;
  expect(f.tracks[0].stop).toHaveBeenCalledOnce(); expect(f.recorders).toHaveLength(0); expect(f.onAudio).not.toHaveBeenCalled();
});
