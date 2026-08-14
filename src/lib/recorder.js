/* ============================================================
   Chunked session recorder.

   MediaRecorder's `timeslice` emits fragments that are NOT independently
   decodable — only the first has a container header. Whisper needs a whole
   file. So instead we run a relay: record for N seconds, stop (which
   finalizes a complete, valid file), hand it off, and immediately start a
   fresh recorder on the same stream. The seam between chunks is a few
   milliseconds, which Whisper handles fine.
   ============================================================ */

function pickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export class SessionRecorder {
  constructor({ chunkSeconds = 45, onChunk, onLevel, onError } = {}) {
    this.chunkSeconds = chunkSeconds;
    this.onChunk = onChunk || (() => {});
    this.onLevel = onLevel || (() => {});
    this.onError = onError || ((e) => console.error(e));

    this.stream = null;
    this.recorder = null;
    this.timer = null;
    this.running = false;
    this.paused = false;
    this.archive = [];
    this.mimeType = '';
    this._audioCtx = null;
    this._raf = null;
    this._chunkIndex = 0;
  }

  static get supported() {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
    );
  }

  async start() {
    if (this.running) return;
    if (!SessionRecorder.supported) {
      throw new Error(
        'This browser cannot record audio. Use Chrome, Edge, or Firefox over http://localhost or HTTPS.'
      );
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false, // we want the whole table, not a phone call
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    this.mimeType = pickMimeType();
    this.running = true;
    this.paused = false;
    this._startMeter();
    this._spin();
  }

  _startMeter() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this._audioCtx = new Ctx();
      const src = this._audioCtx.createMediaStreamSource(this.stream);
      const analyser = this._audioCtx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!this.running) return;
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        this.onLevel(peak);
        this._raf = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn('Level meter unavailable:', e);
    }
  }

  /** Record one chunk, then queue the next. */
  _spin() {
    if (!this.running) return;

    const parts = [];
    const rec = new MediaRecorder(
      this.stream,
      this.mimeType ? { mimeType: this.mimeType, audioBitsPerSecond: 64000 } : undefined
    );
    this.recorder = rec;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) parts.push(e.data);
    };

    rec.onerror = (e) => this.onError(e.error || new Error('Recorder error'));

    rec.onstop = () => {
      if (parts.length) {
        const blob = new Blob(parts, { type: this.mimeType || 'audio/webm' });
        this.archive.push(blob);
        // Sub-kilobyte blobs are silence/artifacts — don't spend a Whisper call.
        if (blob.size > 2000) {
          this.onChunk(blob, { index: this._chunkIndex++, seconds: this.chunkSeconds });
        }
      }
      if (this.running) this._spin();
    };

    rec.start();

    this.timer = setTimeout(() => {
      if (rec.state !== 'inactive') rec.stop();
    }, this.chunkSeconds * 1000);
  }

  /** Force the current chunk to finalize immediately (used by "transcribe now"). */
  flush() {
    if (!this.running || !this.recorder) return;
    clearTimeout(this.timer);
    if (this.recorder.state !== 'inactive') this.recorder.stop();
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    clearTimeout(this.timer);
    if (this.recorder?.state === 'recording') this.recorder.pause();
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    if (this.recorder?.state === 'paused') {
      this.recorder.resume();
      this.timer = setTimeout(() => {
        if (this.recorder?.state !== 'inactive') this.recorder.stop();
      }, this.chunkSeconds * 1000);
    }
  }

  async stop() {
    if (!this.running) return null;
    this.running = false;
    clearTimeout(this.timer);
    cancelAnimationFrame(this._raf);

    await new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === 'inactive') return resolve();
      const rec = this.recorder;
      const prev = rec.onstop;
      rec.onstop = (ev) => {
        try {
          prev?.(ev);
        } finally {
          resolve();
        }
      };
      rec.stop();
    });

    this.stream?.getTracks().forEach((t) => t.stop());
    this._audioCtx?.close().catch(() => {});
    this.onLevel(0);

    return this.archive.length
      ? new Blob(this.archive, { type: this.mimeType || 'audio/webm' })
      : null;
  }
}
