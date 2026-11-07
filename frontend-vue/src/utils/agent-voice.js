// Speech is an input adapter. Reasoning and actions always use the text conversation.
export async function startAgentVoice({ onAudio, onError, isMuted, isBusy }) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let context, recorder, timer, alive = true, active = false, heard = false, started = 0, quiet = 0;
  try {
    context = new AudioContext(); await context.resume();
    const analyser = context.createAnalyser(); analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) throw new Error('瀏覽器不支援錄音格式');
    function listen() {
      if (!alive) return;
      recorder = new MediaRecorder(stream, { mimeType: mime });
      let chunks = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        active = false;
        try {
          if (alive && heard && !isMuted()) await onAudio(new Blob(chunks, { type: mime }), mime);
        } catch (e) { if (alive) onError(e); }
        finally { chunks = []; if (alive) listen(); }
      };
      recorder.onerror = () => { if (alive) onError(new Error('錄音中斷，請重新開啟通話。')); };
      started = Date.now(); quiet = 0; heard = false; active = true; recorder.start();
    }
    listen();
    timer = setInterval(() => {
      if (!active || !alive) return;
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
      if (!isMuted() && !isBusy() && rms > 0.018) { heard = true; quiet = 0; }
      else quiet += 100;
      if ((heard && quiet >= 1100) || Date.now() - started > 20000) {
        if (isMuted() || isBusy()) heard = false;
        if (recorder.state === 'recording') recorder.stop();
      }
    }, 100);
    return {
      setMuted(muted) { stream.getTracks().forEach(t => { t.enabled = !muted; }); if (muted && active && recorder.state === 'recording') { heard = false; recorder.stop(); } },
      flush() { if (alive && active && !isMuted() && !isBusy() && recorder.state === 'recording') { heard = true; recorder.stop(); } },
      stop() { alive = false; clearInterval(timer); if (recorder?.state === 'recording') recorder.stop(); stream.getTracks().forEach(t => t.stop()); context.close().catch(() => {}); },
    };
  } catch (error) { alive = false; clearInterval(timer); stream.getTracks().forEach(t => t.stop()); await context?.close(); throw error; }
}
