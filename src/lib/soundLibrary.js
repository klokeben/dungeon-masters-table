/* ============================================================
   THE SOUND LIBRARY

   Three sources, in order of preference for any given pad:

     1. a file you uploaded yourself      (stored in this browser)
     2. a real recording from Freesound   (needs a Freesound key on the server)
     3. the synthesized fallback patch    (always available, never fails)

   Real audio plays through plain <audio> elements rather than the Web
   Audio graph. That's deliberate: <audio> streams cross-origin without
   needing CORS headers, which Freesound's CDN doesn't send. Crossfading
   is done by ramping element volume, which is all we need.
   ============================================================ */

import { engine } from './audio.js';
import { auth } from './api.js';

const CHOICE_KEY = 'dungeon-masters-table:sound-choices';

/* These calls go through the same password gate as everything else under /api,
   so they need the same header. Without this the board comes up empty on a
   password-protected site. */
const authHeaders = () => {
  const pw = auth.get();
  return pw ? { 'x-app-password': pw } : {};
};

/* ---------- uploaded files live in IndexedDB ---------- */

const DB_NAME = 'dungeon-masters-table-sounds';
let dbPromise = null;

function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('files')) req.result.createObjectStore('files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idb(mode, fn) {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const tx = d.transaction('files', mode);
      const req = fn(tx.objectStore('files'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Sound storage unavailable:', e);
    return null;
  }
}

/* ============================================================ */

class SoundLibrary {
  constructor() {
    this.pads = [];
    this.live = false;          // is a Freesound key configured on the server?
    this.loaded = false;
    this.candidates = new Map(); // padKey -> [{id,name,url,...}]
    this.uploads = new Map();    // padKey -> object URL
    this.sfxCache = new Map();   // padKey -> preloaded Audio
    this.current = null;         // { key, el }
    this.masterVolume = 0.7;
    this.ambienceVolume = 0.55;
    this.sfxVolume = 0.9;
    this.choices = this._readChoices();
    this.listeners = new Set();
  }

  /* ---------- bookkeeping ---------- */

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  _emit() {
    this.listeners.forEach((f) => f());
  }

  _readChoices() {
    try {
      return JSON.parse(localStorage.getItem(CHOICE_KEY) || '{}');
    } catch {
      return {};
    }
  }
  _saveChoices() {
    try {
      localStorage.setItem(CHOICE_KEY, JSON.stringify(this.choices));
    } catch {
      /* private mode */
    }
  }

  async load() {
    if (this.loaded) return this;
    try {
      const res = await fetch('/api/sounds/catalog', { headers: authHeaders() });
      const body = await res.json();
      this.pads = body.pads || [];
      this.live = Boolean(body.live);
    } catch {
      this.pads = [];
      this.live = false;
    }
    this.loaded = true;

    // Restore any sounds the DM uploaded in a previous session.
    const keys = (await idb('readonly', (s) => s.getAllKeys())) || [];
    for (const k of keys) {
      const blob = await idb('readonly', (s) => s.get(k));
      if (blob) this.uploads.set(k, URL.createObjectURL(blob));
    }
    this._emit();
    return this;
  }

  pad(key) {
    return this.pads.find((p) => p.key === key);
  }

  /* ---------- resolving a pad to a playable URL ---------- */

  /** Ask the server what recordings exist for this pad. Cached per session. */
  async fetchCandidates(key) {
    if (this.candidates.has(key)) return this.candidates.get(key);
    if (!this.live) {
      this.candidates.set(key, []);
      return [];
    }
    try {
      const res = await fetch(`/api/sounds/pad/${encodeURIComponent(key)}`, { headers: authHeaders() });
      const body = await res.json();
      const list = body.results || [];
      this.candidates.set(key, list);
      this._emit();
      return list;
    } catch {
      this.candidates.set(key, []);
      return [];
    }
  }

  /** The URL this pad should play right now, or null to use synthesis. */
  async resolve(key) {
    if (this.uploads.has(key)) return { url: this.uploads.get(key), source: 'upload' };
    const list = await this.fetchCandidates(key);
    if (!list.length) return null;
    const pick = list[Math.min(this.choices[key] ?? 0, list.length - 1)];
    return pick ? { url: pick.url, source: 'freesound', meta: pick } : null;
  }

  /** Swap to a different recording for this pad. */
  setChoice(key, index) {
    this.choices[key] = index;
    this._saveChoices();
    this.sfxCache.delete(key);
    this._emit();
  }

  clearChoice(key) {
    delete this.choices[key];
    this._saveChoices();
    this.sfxCache.delete(key);
    this._emit();
  }

  /* ---------- uploads ---------- */

  async upload(key, file) {
    await idb('readwrite', (s) => s.put(file, key));
    const old = this.uploads.get(key);
    if (old) URL.revokeObjectURL(old);
    this.uploads.set(key, URL.createObjectURL(file));
    this.sfxCache.delete(key);
    this._emit();
  }

  async removeUpload(key) {
    await idb('readwrite', (s) => s.delete(key));
    const old = this.uploads.get(key);
    if (old) URL.revokeObjectURL(old);
    this.uploads.delete(key);
    this.sfxCache.delete(key);
    this._emit();
  }

  /* ---------- volume ---------- */

  setMasterVolume(v) {
    this.masterVolume = v;
    engine.setVolume(v);
    if (this.current?.el) this.current.el.volume = this._ambVol();
  }

  setAmbienceVolume(v) {
    this.ambienceVolume = v;
    if (this.current?.el) this.current.el.volume = this._ambVol();
  }

  _ambVol() {
    return Math.max(0, Math.min(1, this.masterVolume * this.ambienceVolume));
  }

  /* ---------- ambience ---------- */

  get playing() {
    return this.current?.key ?? null;
  }

  /** Toggle an ambience. Crossfades out whatever was playing. */
  async playAmbience(key) {
    if (this.playing === key) {
      this.stopAmbience();
      return null;
    }
    this.stopAmbience();

    const found = await this.resolve(key);
    if (!found) {
      // No recording available — fall back to the synthesized bed. Track it
      // under the pad's own key so the UI highlights what was clicked, not
      // whichever synth patch happens to back it.
      const pad = this.pad(key);
      engine.playAmbience(pad?.synth || key);
      this.current = { key, el: null, synth: true };
      this._emit();
      return key;
    }

    const el = new Audio(found.url);
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
    el.crossOrigin = null; // plain streaming; no Web Audio processing on this element

    el.play().catch((e) => {
      console.warn('Could not play ambience, falling back to synthesis:', e);
      const pad = this.pad(key);
      engine.playAmbience(pad?.synth || key);
    });

    this.current = { key, el };
    this._fade(el, this._ambVol(), 1400);
    this._emit();
    return key;
  }

  stopAmbience() {
    engine.stopAmbience();
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    if (cur.el) {
      this._fade(cur.el, 0, 900, () => {
        cur.el.pause();
        cur.el.src = '';
      });
    }
    this._emit();
  }

  _fade(el, to, ms, done) {
    const from = el.volume;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      try {
        el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      } catch {
        return;
      }
      if (t < 1) requestAnimationFrame(step);
      else done?.();
    };
    requestAnimationFrame(step);
  }

  /* ---------- effects ---------- */

  /** Fire a one-shot. Overlapping presses layer rather than cutting each other off. */
  async playSfx(key) {
    const found = await this.resolve(key);
    if (!found) {
      const pad = this.pad(key);
      engine.playSfx(pad?.synth || key);
      return;
    }
    const el = new Audio(found.url);
    el.volume = Math.max(0, Math.min(1, this.masterVolume * this.sfxVolume));
    el.play().catch(() => {
      const pad = this.pad(key);
      engine.playSfx(pad?.synth || key);
    });
  }

  /** Warm the browser cache so the first press of a pad isn't laggy. */
  async preload(key) {
    if (this.sfxCache.has(key)) return;
    const found = await this.resolve(key);
    if (!found) return;
    const el = new Audio(found.url);
    el.preload = 'auto';
    el.load();
    this.sfxCache.set(key, el);
  }
}

export const library = new SoundLibrary();
