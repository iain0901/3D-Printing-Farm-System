// Speech is an input adapter. Reasoning and actions always use the text conversation.
export async function startAgentVoice({ onAudio, onError, isMuted, isBusy, onState = () => {}, signal }) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  if (signal?.aborted) { stream.getTracks().forEach(t => t.stop()); throw new DOMException('通話已取消', 'AbortError'); }
  let context, recorder, timer, retryTimer, alive = true, active = false, heard = false, voicedFrames = 0, started = 0, quiet = 0;
  function stop() {
    if (!alive) return;
    alive = false; clearInterval(timer); clearTimeout(retryTimer); signal?.removeEventListener('abort', stop);
    if (recorder?.state === 'recording') recorder.stop();
    stream.getTracks().forEach(t => t.stop()); context?.close().catch(() => {});
  }
  signal?.addEventListener('abort', stop, { once: true });
  try {
    context = new AudioContext(); await context.resume();
    if (!alive) throw new DOMException('通話已取消', 'AbortError');
    const analyser = context.createAnalyser(); analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) throw new Error('瀏覽器不支援錄音格式');
    function listen() {
      if (!alive) return;
      if (isMuted() || isBusy()) { onState('waiting'); retryTimer = setTimeout(listen, 100); return; }
      recorder = new MediaRecorder(stream, { mimeType: mime });
      let chunks = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        active = false;
        try {
          if (alive && heard && !isMuted()) { onState('sent'); await onAudio(new Blob(chunks, { type: mime }), mime); }
        } catch (e) { if (alive) onError(e); }
        finally { chunks = []; if (alive) listen(); }
      };
      recorder.onerror = () => { if (alive) onError(new Error('錄音中斷，請重新開啟通話。')); };
      started = Date.now(); quiet = 0; voicedFrames = 0; heard = false; active = true; recorder.start(); onState('listening');
    }
    listen();
    timer = setInterval(() => {
      if (!active || !alive) return;
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
      if (!isMuted() && !isBusy() && rms > 0.018) { voicedFrames++; if (!heard && voicedFrames >= 2) { heard = true; onState('recording'); } quiet = 0; }
      else { quiet += 100; if (!heard) voicedFrames = 0; }
      if ((heard && quiet >= 1100) || Date.now() - started > 20000) {
        if (isMuted() || isBusy()) heard = false;
        if (recorder.state === 'recording') recorder.stop();
      }
    }, 100);
    return {
      setMuted(muted) { stream.getTracks().forEach(t => { t.enabled = !muted; }); if (muted && active && recorder.state === 'recording') { heard = false; recorder.stop(); } },
      flush() { if (alive && active && !isMuted() && !isBusy() && recorder.state === 'recording') { heard = true; recorder.stop(); } },
      stop,
    };
  } catch (error) { stop(); throw error; }
}
