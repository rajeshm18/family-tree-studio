/* FT.Whisper: offline speech-to-text through the local whisper.cpp server (voice-engine folder).
   Audio never leaves the PC: mic → 16 kHz WAV in the browser → http://127.0.0.1:8178/inference. */
window.FT = window.FT || {};
(function () {
  'use strict';
  const URL_BASE = 'http://127.0.0.1:8178';
  // Phrases Whisper sometimes "hears" in silence or noise.
  const JUNK = /^\W*(thank(s| you)( (so|very) much)?( for watching)?|you|bye|\[?blank_audio\]?|\(.*\)|\[.*\]|music|okay)\W*$/i;

  const W = {
    url: URL_BASE, ok: null, checkedAt: 0,

    /** Is the local engine running? (cached for 5 s) */
    async available(force) {
      if (!force && this.ok !== null && Date.now() - this.checkedAt < 5000) return this.ok;
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 900);
        const r = await fetch(this.url + '/', { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(t); this.ok = r.ok;
      } catch (e) { this.ok = false; }
      this.checkedAt = Date.now();
      return this.ok;
    },

    /** Hint words for Whisper: the names already in the tree, so it spells them the way you do. */
    prompt(extra) {
      const M = FT.app; if (!M) return '';
      const sel = FT.UI && FT.UI.sel;
      const ids = Object.keys(M.people);
      // people near the selected person first, then everyone else
      const near = sel ? [sel].concat(M.parents(sel), M.partners(sel), M.children(sel), M.siblings(sel)) : [];
      const order = Array.from(new Set(near.concat(ids)));
      const names = []; let len = 0;
      for (const id of order) {
        const n = M.displayName(id); if (!n || n === 'Unnamed' || names.includes(n)) continue;
        if (len + n.length > 600) break;
        names.push(n); len += n.length + 2;
      }
      return (extra ? extra + ' ' : '') + (names.length ? 'Family members: ' + names.join(', ') + '.' : '');
    },

    async transcribe(wav, prompt) {
      const fd = new FormData();
      fd.append('file', wav, 'speech.wav');
      fd.append('temperature', '0.0');
      fd.append('beam_size', '5'); // more careful decoding; still well under a second on the GPU
      fd.append('response_format', 'json');
      if (prompt) fd.append('prompt', prompt);
      const r = await fetch(this.url + '/inference', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('Voice engine error ' + r.status);
      const j = await r.json();
      let text = String(j.text || '').replace(/\s+/g, ' ').trim();
      if (JUNK.test(text)) text = '';
      return text;
    },

    /**
     * Listen from the microphone and cut speech into segments at pauses.
     * opts: { once:bool, silenceMs, onState(state), onLevel(0..1), onText(text), onError(err) }
     * Returns a controller with stop().
     */
    async listen(opts) {
      opts = opts || {};
      const silenceMs = opts.silenceMs || 1100;
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      } catch (e) { opts.onError && opts.onError(new Error('Microphone blocked or not found. Allow the microphone for this page.')); return { stop() {} }; }
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      const src = ac.createMediaStreamSource(stream);
      const proc = ac.createScriptProcessor(4096, 1, 1);
      const mute = ac.createGain(); mute.gain.value = 0;
      src.connect(proc); proc.connect(mute); mute.connect(ac.destination);

      let chunks = [], speaking = false, lastVoice = 0, voicedMs = 0, stopped = false, noise = 0.004, busy = Promise.resolve();
      const pre = []; // ~0.4 s of audio before speech starts, so the first syllable isn't lost
      const sr = ac.sampleRate, chunkMs = 4096 / sr * 1000;

      const flush = () => {
        const data = chunks; chunks = []; speaking = false;
        const enough = voicedMs > 350; voicedMs = 0;
        if (!enough) { opts.onState && opts.onState('listening'); return; }
        const wav = encodeWav(data, sr);
        opts.onState && opts.onState('transcribing');
        busy = busy.then(() => this.transcribe(wav, opts.prompt ? opts.prompt() : this.prompt()))
          .then((t) => { if (t) opts.onText && opts.onText(t); })
          .catch((e) => opts.onError && opts.onError(e))
          .then(() => { if (!stopped) opts.onState && opts.onState('listening'); else opts.onState && opts.onState('idle'); });
        if (opts.once) ctl.stop(true);
      };

      proc.onaudioprocess = (e) => {
        if (stopped) return;
        const x = e.inputBuffer.getChannelData(0);
        let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i];
        const rms = Math.sqrt(s / x.length);
        const copy = new Float32Array(x);
        const loud = rms > Math.max(0.012, noise * 3);
        if (!speaking && !loud) noise = noise * 0.95 + rms * 0.05; // track background noise
        opts.onLevel && opts.onLevel(Math.min(1, rms * 12));
        const now = performance.now();
        if (loud) {
          if (!speaking) { speaking = true; chunks = pre.splice(0); opts.onState && opts.onState('hearing'); }
          lastVoice = now; voicedMs += chunkMs;
        }
        if (speaking) {
          chunks.push(copy);
          if (now - lastVoice > silenceMs || chunks.length * chunkMs > 28000) flush();
        } else { pre.push(copy); if (pre.length > 4) pre.shift(); }
      };

      const ctl = {
        stop(keepPending) {
          if (stopped) return; stopped = true;
          if (!keepPending && speaking && voicedMs > 350) { stopped = false; flush(); stopped = true; }
          proc.disconnect(); src.disconnect();
          stream.getTracks().forEach((t) => t.stop());
          ac.close().catch(() => {});
          busy.then(() => opts.onState && opts.onState('idle'));
        }
      };
      opts.onState && opts.onState('listening');
      return ctl;
    }
  };

  /** Float32 chunks at any sample rate → 16 kHz mono 16-bit WAV Blob. */
  function encodeWav(chunks, rate) {
    const len = chunks.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(len); let o = 0;
    chunks.forEach((c) => { all.set(c, o); o += c.length; });
    const ratio = rate / 16000, outLen = Math.floor(len / ratio);
    const pcm = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const a = Math.floor(i * ratio), b = Math.min(len, Math.floor((i + 1) * ratio));
      let s = 0; for (let j = a; j < b; j++) s += all[j];
      const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    const buf = new ArrayBuffer(44 + pcm.length * 2), dv = new DataView(buf);
    const str = (p, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(p + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 16000, true); dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
    new Int16Array(buf, 44).set(pcm);
    return new Blob([buf], { type: 'audio/wav' });
  }
  W.encodeWav = encodeWav;
  FT.Whisper = W;
})();
