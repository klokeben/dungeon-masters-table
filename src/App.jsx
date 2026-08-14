import React, { useState, useEffect } from 'react';
import { ToastProvider, Panel, Field, Rule, Modal, downloadText } from './components/ui.jsx';
import Crest from './components/Crest.jsx';
import { useStore, actions, getState } from './lib/store.js';
import { api, auth } from './lib/api.js';

import LiveSession from './tabs/LiveSession.jsx';
import SessionNotes from './tabs/SessionNotes.jsx';
import Characters from './tabs/Characters.jsx';
import Improv from './tabs/Improv.jsx';
import Soundboard from './tabs/Soundboard.jsx';

const TABS = [
  { key: 'live', label: 'Live Session', glyph: '🔴', Comp: LiveSession },
  { key: 'notes', label: 'Session Notes', glyph: '📜', Comp: SessionNotes },
  { key: 'party', label: 'The Party', glyph: '🛡️', Comp: Characters },
  { key: 'improv', label: 'Improv Forge', glyph: '🎲', Comp: Improv },
  { key: 'sound', label: 'Soundboard', glyph: '🎵', Comp: Soundboard },
];

export default function App() {
  const [tab, setTab] = useState('live');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [health, setHealth] = useState(null);
  const [locked, setLocked] = useState(false);

  const live = useStore((s) => s.live);
  const campaign = useStore((s) => s.campaign);
  const characters = useStore((s) => s.characters);
  const sessions = useStore((s) => s.sessions);

  useEffect(() => {
    api.health().then((h) => {
      setHealth(h);
      // The server only reports "locked" when APP_PASSWORD is set on it.
      if (h.locked && !auth.get()) setLocked(true);
    });
    const onLocked = () => setLocked(true);
    window.addEventListener('dmt:locked', onLocked);
    return () => window.removeEventListener('dmt:locked', onLocked);
  }, []);

  // Warn before closing the tab mid-session — losing a live transcript would hurt.
  useEffect(() => {
    if (!live) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [live]);

  // Alt+1..5 jumps between tabs
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey) return;
      const i = parseInt(e.key, 10) - 1;
      if (TABS[i]) {
        setTab(TABS[i].key);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const Active = TABS.find((t) => t.key === tab)?.Comp || LiveSession;

  if (locked) {
    return (
      <ToastProvider>
        <LockScreen
          onUnlocked={() => {
            setLocked(false);
            api.health().then(setHealth);
          }}
        />
      </ToastProvider>
    );
  }

  const badgeFor = (key) => {
    if (key === 'live' && live) return <span className="rec-dot" />;
    if (key === 'party' && characters.length) return <span className="tab-badge">{characters.length}</span>;
    if (key === 'notes' && sessions.length) return <span className="tab-badge">{sessions.length}</span>;
    return null;
  };

  return (
    <ToastProvider>
      <div className="app">
        <header className="banner">
          <Crest />
          <div>
            <h1>The Dungeon Master's Table</h1>
            <div className="tagline">{campaign.name}</div>
          </div>

          <div className="banner-right">
            <ServiceLamp health={health} />
            <button className="btn sm ghost" onClick={() => setSettingsOpen(true)}>
              ⚙ Campaign
            </button>
          </div>
        </header>

        <nav className="tabs">
          {TABS.map((t, i) => (
            <button
              key={t.key}
              className={`tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
              title={`Alt+${i + 1}`}
            >
              <span className="tab-glyph">{t.glyph}</span>
              {t.label}
              {badgeFor(t.key)}
            </button>
          ))}
        </nav>

        <main className="tab-body">
          <div className="wrap">
            <Active goToTab={setTab} health={health} />
          </div>
        </main>

        <CampaignSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} health={health} />
      </div>
    </ToastProvider>
  );
}

/* ============================================================
   Lock screen — only ever shown when the server has APP_PASSWORD set
   ============================================================ */

function LockScreen({ onUnlocked }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e?.preventDefault();
    if (!pw) return;
    setBusy(true);
    setErr('');
    try {
      await api.unlock(pw);
      onUnlocked();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="app"
      style={{ alignItems: 'center', justifyContent: 'center', padding: 26 }}
    >
      <form className="panel dark" style={{ maxWidth: 400, width: '100%' }} onSubmit={submit}>
        <div className="center" style={{ marginBottom: 6 }}>
          <Crest size={62} />
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            textAlign: 'center',
            color: 'var(--gold-bright)',
            margin: '0 0 4px',
          }}
        >
          The Dungeon Master's Table
        </h1>
        <p className="tiny muted center" style={{ marginTop: 0, marginBottom: 18 }}>
          Speak, friend, and enter.
        </p>

        <Field label="Password">
          <input
            type="password"
            value={pw}
            autoFocus
            onChange={(e) => setPw(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

        {err && (
          <p className="tiny" style={{ color: '#e59a9a', marginBottom: 0 }}>
            {err}
          </p>
        )}

        <div style={{ height: 14 }} />
        <button className="btn gold block" type="submit" disabled={busy || !pw}>
          {busy ? <span className="spinner" /> : 'Enter'}
        </button>
      </form>
    </div>
  );
}

/* ============================================================
   Backend status lamp
   ============================================================ */

function ServiceLamp({ health }) {
  const dot = (on, label) => (
    <span
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: 'var(--font-head)',
        fontSize: 10,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        opacity: 0.85,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: on ? '#7aa04f' : '#a13a1e',
          boxShadow: `0 0 7px ${on ? '#7aa04f' : '#a13a1e'}`,
        }}
      />
      {label}
    </span>
  );

  if (!health) return null;
  return (
    <div className="row tight" style={{ gap: 12 }}>
      {dot(health.claude, 'Claude')}
      {dot(health.whisper, 'Whisper')}
    </div>
  );
}

/* ============================================================
   Campaign settings
   ============================================================ */

function CampaignSettings({ open, onClose, health }) {
  const campaign = useStore((s) => s.campaign);
  const settings = useStore((s) => s.settings);
  const [glossaryDraft, setGlossaryDraft] = useState('');

  useEffect(() => {
    if (open) setGlossaryDraft((campaign.glossary || []).join(', '));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open={open} onClose={onClose} title="Campaign & Settings">
      <div className="grid two">
        <Field label="Campaign name">
          <input
            type="text"
            value={campaign.name}
            onChange={(e) => actions.updateCampaign({ name: e.target.value })}
          />
        </Field>
        <Field label="Default party level">
          <input
            type="number"
            min="1"
            max="20"
            value={campaign.level}
            onChange={(e) => actions.updateCampaign({ level: Number(e.target.value) })}
          />
        </Field>
      </div>

      <div style={{ height: 12 }} />

      <Field label="Setting — used as context for every generator">
        <textarea
          rows={3}
          value={campaign.setting}
          onChange={(e) => actions.updateCampaign({ setting: e.target.value })}
        />
      </Field>

      <div style={{ height: 12 }} />

      <Field label="Tone">
        <select value={campaign.tone} onChange={(e) => actions.updateCampaign({ tone: e.target.value })}>
          {[
            'grounded heroic',
            'high fantasy',
            'grimdark',
            'swashbuckling',
            'gothic horror',
            'comedic',
            'political intrigue',
            'weird / cosmic',
            'sword & sorcery',
            'fairy tale',
          ].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <Rule />

      <Field label="Glossary — names Whisper keeps mangling, comma separated">
        <textarea
          rows={3}
          value={glossaryDraft}
          onChange={(e) => setGlossaryDraft(e.target.value)}
          onBlur={() =>
            actions.updateCampaign({
              glossary: glossaryDraft
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="Kaelthorne, Marrowfell, the Ashen Compact, Sister Ilva…"
        />
      </Field>
      <p className="tiny muted" style={{ marginTop: 6 }}>
        These are fed to the transcriber as a vocabulary hint and to the note-writer as canonical spellings.
        Character names are added automatically.
      </p>

      <Rule />

      <div className="grid two">
        <Field label={`Transcribe every ${settings.chunkSeconds}s`}>
          <input
            type="range"
            min="20"
            max="120"
            step="5"
            value={settings.chunkSeconds}
            onChange={(e) => actions.updateSettings({ chunkSeconds: Number(e.target.value) })}
          />
        </Field>
        <div className="stack" style={{ justifyContent: 'center' }}>
          <label className="row tight" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={settings.autoScanHp}
              onChange={(e) => actions.updateSettings({ autoScanHp: e.target.checked })}
            />
            <span className="tiny">Watch the transcript for HP changes</span>
          </label>
          <label className="row tight" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={settings.autoApplyHigh}
              onChange={(e) => actions.updateSettings({ autoApplyHigh: e.target.checked })}
            />
            <span className="tiny">Apply high-confidence changes without asking</span>
          </label>
        </div>
      </div>

      <Rule />

      <div className="row">
        <button
          className="btn sm"
          onClick={() => downloadText(`dm-table-backup-${Date.now()}.json`, actions.exportAll(), 'application/json')}
        >
          ⬇ Export everything
        </button>
        <label className="btn sm" style={{ cursor: 'pointer' }}>
          ⬆ Import backup
          <input
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                actions.importAll(await f.text());
                onClose();
              } catch {
                alert('That file could not be read as a backup.');
              }
            }}
          />
        </label>
        <span className="spacer" />
        <button
          className="btn sm blood"
          onClick={() => {
            if (confirm('Erase all campaign data on this browser? This cannot be undone.')) {
              actions.wipe();
              onClose();
            }
          }}
        >
          Wipe local data
        </button>
      </div>

      {health && (!health.claude || !health.whisper) && (
        <>
          <Rule />
          <p className="tiny" style={{ color: 'var(--oxblood)' }}>
            <strong>Backend keys missing.</strong>{' '}
            {!health.claude && 'ANTHROPIC_API_KEY is not set — generators, notes, and sheet parsing are offline. '}
            {!health.whisper && 'OPENAI_API_KEY is not set — recording transcription is offline. '}
            Add them to <span className="mono">server/.env</span> and restart the server.
          </p>
        </>
      )}
    </Modal>
  );
}

export { getState };
