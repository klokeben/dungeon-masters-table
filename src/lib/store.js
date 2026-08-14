/* ============================================================
   Tiny global store — subscribe/snapshot, persisted to localStorage.
   No dependencies, no boilerplate, survives a browser refresh.
   ============================================================ */

import { useSyncExternalStore } from 'react';

const KEY = 'dungeon-masters-table:v1';

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const DEFAULT_STATE = {
  campaign: {
    name: 'A New Campaign',
    setting: 'A frontier region on the edge of a fading empire.',
    tone: 'grounded heroic',
    level: 3,
    glossary: [],
  },
  characters: [],
  sessions: [],
  generated: [],
  settings: {
    chunkSeconds: 20,
    autoScanHp: true,
    autoApplyHigh: false,
    masterVolume: 0.7,
  },
  live: null, // set when a session is running
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const saved = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...saved,
      campaign: { ...DEFAULT_STATE.campaign, ...(saved.campaign || {}) },
      settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

let state = load();
const listeners = new Set();

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not persist state:', e);
  }
  listeners.forEach((l) => l());
}

export function getState() {
  return state;
}

export function setState(patchOrFn) {
  const patch = typeof patchOrFn === 'function' ? patchOrFn(state) : patchOrFn;
  if (!patch) return;
  state = { ...state, ...patch };
  emit();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** useStore(s => s.characters) — re-renders only when that slice changes identity. */
export function useStore(selector = (s) => s) {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state)
  );
}

/* ============================================================
   Domain actions
   ============================================================ */

export const actions = {
  /* ---------- campaign ---------- */
  updateCampaign(patch) {
    setState((s) => ({ campaign: { ...s.campaign, ...patch } }));
  },

  addGlossaryTerms(terms) {
    setState((s) => {
      const set = new Set(s.campaign.glossary);
      terms.filter(Boolean).forEach((t) => set.add(t));
      return { campaign: { ...s.campaign, glossary: [...set].slice(0, 300) } };
    });
  },

  /* ---------- characters ---------- */
  addCharacter(sheet) {
    const c = {
      id: uid(),
      addedAt: Date.now(),
      conditions: [],
      deathSaves: { successes: 0, failures: 0 },
      dmNotes: '',
      ...sheet,
    };
    if (!c.hp) c.hp = { current: 0, max: 0, temp: 0 };
    if (c.hp.current == null) c.hp.current = c.hp.max || 0;
    if (c.hp.temp == null) c.hp.temp = 0;
    setState((s) => ({ characters: [...s.characters, c] }));
    // feed names into the glossary so Whisper + synthesis spell them right
    actions.addGlossaryTerms([c.name, c.race, c.class, c.subclass, c.background].filter(Boolean));
    return c;
  },

  updateCharacter(id, patch) {
    setState((s) => ({
      characters: s.characters.map((c) =>
        c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c
      ),
    }));
  },

  removeCharacter(id) {
    setState((s) => ({ characters: s.characters.filter((c) => c.id !== id) }));
  },

  /** Apply an HP delta. Negative = damage (eats temp HP first), positive = healing. */
  applyHp(id, delta, { setTemp } = {}) {
    setState((s) => ({
      characters: s.characters.map((c) => {
        if (c.id !== id) return c;
        const hp = { ...(c.hp || { current: 0, max: 0, temp: 0 }) };
        if (setTemp != null) {
          hp.temp = Math.max(hp.temp || 0, setTemp);
          return { ...c, hp };
        }
        if (delta < 0) {
          // Temp HP is spent before real HP, and 5e doesn't track negatives:
          // you stop at 0 and start rolling death saves.
          let dmg = -delta;
          const temp = hp.temp || 0;
          const absorbed = Math.min(temp, dmg);
          hp.temp = temp - absorbed;
          dmg -= absorbed;
          hp.current = Math.max(0, (hp.current || 0) - dmg);
        } else {
          // Healing a downed character brings them to exactly the amount healed.
          hp.current = Math.min(hp.max || 0, Math.max(0, hp.current || 0) + delta);
        }
        return { ...c, hp };
      }),
    }));
  },

  /* ---------- live session ---------- */
  startLive(payload = {}) {
    setState((s) => ({
      live: {
        id: uid(),
        startedAt: Date.now(),
        endedAt: null,
        recording: false,
        transcript: '',
        unscanned: '',
        pendingEvents: [],
        eventLog: [],
        initiative: [],
        round: 0,
        turnIndex: 0,
        campaignName: s.campaign.name,
        ...payload,
      },
    }));
  },

  patchLive(patch) {
    setState((s) =>
      s.live ? { live: { ...s.live, ...(typeof patch === 'function' ? patch(s.live) : patch) } } : null
    );
  },

  appendTranscript(text) {
    if (!text || !text.trim()) return;
    setState((s) => {
      if (!s.live) return null;
      const sep = s.live.transcript ? ' ' : '';
      return {
        live: {
          ...s.live,
          transcript: s.live.transcript + sep + text.trim(),
          unscanned: (s.live.unscanned ? s.live.unscanned + ' ' : '') + text.trim(),
        },
      };
    });
  },

  logEvent(entry) {
    setState((s) =>
      s.live
        ? {
            live: {
              ...s.live,
              eventLog: [{ id: uid(), at: Date.now(), ...entry }, ...s.live.eventLog].slice(0, 400),
            },
          }
        : null
    );
  },

  endLive() {
    const live = state.live;
    if (!live) return null;
    const session = {
      id: live.id,
      startedAt: live.startedAt,
      endedAt: Date.now(),
      campaignName: live.campaignName,
      transcript: live.transcript,
      eventLog: live.eventLog,
      notes: null,
      title: null,
    };
    setState((s) => ({ sessions: [session, ...s.sessions], live: null }));
    return session;
  },

  /* ---------- sessions ---------- */
  addSession(session) {
    const s2 = { id: uid(), startedAt: Date.now(), endedAt: Date.now(), notes: null, ...session };
    setState((s) => ({ sessions: [s2, ...s.sessions] }));
    return s2;
  },

  updateSession(id, patch) {
    setState((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch) } : x
      ),
    }));
  },

  removeSession(id) {
    setState((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }));
  },

  /* ---------- generated content ---------- */
  saveGenerated(entry) {
    const g = { id: uid(), createdAt: Date.now(), pinned: false, ...entry };
    setState((s) => ({ generated: [g, ...s.generated].slice(0, 300) }));
    return g;
  },

  updateGenerated(id, patch) {
    setState((s) => ({
      generated: s.generated.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  },

  removeGenerated(id) {
    setState((s) => ({ generated: s.generated.filter((g) => g.id !== id) }));
  },

  /* ---------- settings ---------- */
  updateSettings(patch) {
    setState((s) => ({ settings: { ...s.settings, ...patch } }));
  },

  /* ---------- data management ---------- */
  exportAll() {
    return JSON.stringify(state, null, 2);
  },

  importAll(json) {
    const parsed = JSON.parse(json);
    state = { ...structuredClone(DEFAULT_STATE), ...parsed };
    emit();
  },

  wipe() {
    state = structuredClone(DEFAULT_STATE);
    emit();
  },
};
