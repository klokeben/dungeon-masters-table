/* ============================================================
   Thin client for the Express backend.
   ============================================================ */

/* ---------- optional password ----------
   The server only asks for one if APP_PASSWORD is set in its environment.
   When it does, we keep the password here and attach it to every call. */

const PW_KEY = 'dungeon-masters-table:password';

export const auth = {
  get: () => {
    try { return localStorage.getItem(PW_KEY) || ''; } catch { return ''; }
  },
  set: (pw) => {
    try { pw ? localStorage.setItem(PW_KEY, pw) : localStorage.removeItem(PW_KEY); } catch { /* private mode */ }
  },
};

/** Headers for a JSON request, plus the password if we have one. */
function head(extra = {}) {
  const pw = auth.get();
  return pw ? { ...extra, 'x-app-password': pw } : extra;
}

/** Raised when the server says we're locked out, so the UI can show the gate. */
export class LockedError extends Error {
  constructor() {
    super('This site is password protected.');
    this.locked = true;
  }
}

async function handle(res) {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    let body = null;
    try {
      body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401 && body?.locked) {
      auth.set('');
      window.dispatchEvent(new Event('dmt:locked'));
      throw new LockedError();
    }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  async health() {
    try {
      return await handle(await fetch('/api/health'));
    } catch {
      return { ok: false, claude: false, whisper: false, unreachable: true };
    }
  },

  async transcribe(blob, { vocabulary } = {}) {
    const fd = new FormData();
    // Whisper decides how to decode partly from the filename, so keep a real
    // extension: the original one for uploaded files, a guess for live chunks.
    const t = blob.type || '';
    const guess = t.includes('mpeg') || t.includes('mp3') ? 'mp3'
      : t.includes('mp4') || t.includes('m4a') ? 'mp4'
      : t.includes('ogg') ? 'ogg'
      : t.includes('wav') ? 'wav'
      : t.includes('flac') ? 'flac'
      : 'webm';
    const name = blob.name && /\.[a-z0-9]{2,5}$/i.test(blob.name) ? blob.name : `chunk.${guess}`;
    fd.append('audio', blob, name);
    if (vocabulary) fd.append('vocabulary', vocabulary);
    return handle(await fetch('/api/transcribe', { method: 'POST', headers: head(), body: fd }));
  },

  async synthesize(payload) {
    return handle(
      await fetch('/api/synthesize', {
        method: 'POST',
        headers: head({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      })
    );
  },

  async generate(kind, params) {
    return handle(
      await fetch('/api/generate', {
        method: 'POST',
        headers: head({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ kind, params }),
      })
    );
  },

  async parseSheet({ file, text }) {
    const fd = new FormData();
    if (file) fd.append('sheet', file, file.name);
    if (text) fd.append('text', text);
    return handle(await fetch('/api/parse-sheet', { method: 'POST', headers: head(), body: fd }));
  },

  async combatScan(payload) {
    return handle(
      await fetch('/api/combat-scan', {
        method: 'POST',
        headers: head({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      })
    );
  },

  /** Check a password against the server; stores it on success. */
  async unlock(password) {
    const res = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'That password is not right.');
    }
    auth.set(password);
    return true;
  },

  async ask(question, context) {
    return handle(
      await fetch('/api/ask', {
        method: 'POST',
        headers: head({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ question, context }),
      })
    );
  },
};
