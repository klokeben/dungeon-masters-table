import React, { useEffect, useRef, useState } from 'react';
import { Panel, Rule, Tag, Modal, Empty, useToast } from '../components/ui.jsx';
import { library } from '../lib/soundLibrary.js';
import { useStore, actions } from '../lib/store.js';

/** Re-render whenever the library changes (choices, uploads, fetched candidates). */
function useLibrary() {
  const [, bump] = useState(0);
  useEffect(() => library.onChange(() => bump((n) => n + 1)), []);
  return library;
}

export default function Soundboard() {
  const settings = useStore((s) => s.settings);
  const lib = useLibrary();
  const toast = useToast();

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(null);
  const [ambVol, setAmbVol] = useState(0.55);
  const [chooser, setChooser] = useState(null);

  useEffect(() => {
    library.load().then(() => setReady(true));
  }, []);

  useEffect(() => {
    library.setMasterVolume(settings.masterVolume);
  }, [settings.masterVolume]);

  useEffect(() => {
    library.setAmbienceVolume(ambVol);
  }, [ambVol]);

  const ambiences = lib.pads.filter((p) => p.kind === 'ambience');
  const effects = lib.pads.filter((p) => p.kind === 'sfx');
  const groups = [...new Set(effects.map((s) => s.group))];
  const hotkeyed = effects.slice(0, 9);

  const fire = async (key) => {
    setFlash(key);
    setTimeout(() => setFlash((f) => (f === key ? null : f)), 260);
    await library.playSfx(key);
  };

  const toggle = async (key) => {
    setBusy(key);
    try {
      await library.playAmbience(key);
      setPlaying(library.playing);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const i = parseInt(e.key, 10) - 1;
      if (i >= 0 && i < hotkeyed.length) fire(hotkeyed[i].key);
      if (e.key === 'Escape') {
        library.stopAmbience();
        setPlaying(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeyed.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return (
      <Panel>
        <Empty glyph="🎵">Opening the sound chest…</Empty>
      </Panel>
    );
  }

  return (
    <>
      <Panel
        dark
        title="Soundboard"
        sub={
          lib.live
            ? 'Real recordings, streamed on demand. Any pad you dislike can be swapped or replaced with your own file.'
            : 'Running on built-in synthesis. Add a free Freesound key to swap in real recordings.'
        }
      >
        <div className="row" style={{ gap: 20 }}>
          <label className="row tight" style={{ flex: '1 1 200px', gap: 10 }}>
            <span className="tiny" style={{ letterSpacing: '.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Master
            </span>
            <input
              type="range" min="0" max="1" step="0.01"
              value={settings.masterVolume}
              onChange={(e) => actions.updateSettings({ masterVolume: Number(e.target.value) })}
            />
          </label>

          <label className="row tight" style={{ flex: '1 1 200px', gap: 10 }}>
            <span className="tiny" style={{ letterSpacing: '.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Ambience
            </span>
            <input
              type="range" min="0" max="1" step="0.01"
              value={ambVol}
              onChange={(e) => setAmbVol(Number(e.target.value))}
            />
          </label>

          <span className="spacer" />

          {playing && (
            <button className="btn sm blood" onClick={() => { library.stopAmbience(); setPlaying(null); }}>
              ■ Silence (Esc)
            </button>
          )}
        </div>

        {!lib.live && (
          <>
            <Rule />
            <p className="tiny muted" style={{ margin: 0 }}>
              <strong>Want real audio?</strong> Create a free account at{' '}
              <a href="https://freesound.org" target="_blank" rel="noreferrer" style={{ color: 'var(--gold-bright)' }}>
                freesound.org
              </a>{' '}
              (no card needed), apply for an API key, and add it to your server settings as{' '}
              <span className="mono">FREESOUND_API_KEY</span>. Every pad below switches to real
              recordings automatically.
            </p>
          </>
        )}
      </Panel>

      {/* ---------- ambience ---------- */}
      <Panel title="Set the Scene" sub="One at a time — picking a new one crossfades. Click again to stop.">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(196px, 1fr))', gap: 10 }}>
          {ambiences.map((a) => (
            <Pad
              key={a.key}
              pad={a}
              on={playing === a.key}
              busy={busy === a.key}
              lib={lib}
              onClick={() => toggle(a.key)}
              onCustomize={() => setChooser(a)}
              tall
            />
          ))}
        </div>
      </Panel>

      {/* ---------- effects ---------- */}
      {groups.map((g) => (
        <Panel key={g} title={g}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(136px, 1fr))', gap: 8 }}>
            {effects
              .filter((s) => s.group === g)
              .map((s) => {
                const hot = hotkeyed.findIndex((h) => h.key === s.key);
                return (
                  <Pad
                    key={s.key}
                    pad={s}
                    lit={flash === s.key}
                    hotkey={hot >= 0 ? hot + 1 : null}
                    lib={lib}
                    onClick={() => fire(s.key)}
                    onCustomize={() => setChooser(s)}
                    onHover={() => library.preload(s.key)}
                  />
                );
              })}
          </div>
        </Panel>
      ))}

      <Panel dark>
        <div className="row tight">
          <Tag tone="gold">1–9</Tag>
          <span className="tiny muted">fire the first nine effects</span>
          <Tag tone="gold">Esc</Tag>
          <span className="tiny muted">kill the ambience</span>
          <span className="spacer" />
          <span className="tiny muted">Sound keeps playing while you work in other tabs.</span>
        </div>
      </Panel>

      <ChooserModal pad={chooser} lib={lib} onClose={() => setChooser(null)} toast={toast} />
    </>
  );
}

/* ============================================================
   One pad
   ============================================================ */

function Pad({ pad, on, lit, busy, hotkey, lib, onClick, onCustomize, onHover, tall }) {
  const custom = lib.uploads.has(pad.key);
  const swapped = lib.choices[pad.key] > 0;

  const base = {
    cursor: 'pointer',
    font: 'inherit',
    position: 'relative',
    borderRadius: 3,
    transition: 'all .15s',
    textAlign: tall ? 'left' : 'center',
    color: on ? '#2a1c04' : 'var(--ink)',
    padding: tall ? '13px 14px' : '12px 8px 10px',
    border: `1px solid ${on || lit ? 'var(--gold-bright)' : 'rgba(0,0,0,.22)'}`,
    background: on
      ? 'linear-gradient(180deg, var(--gold-bright), var(--gold))'
      : lit
      ? 'radial-gradient(circle at 50% 40%, rgba(236,203,90,.85), rgba(201,162,39,.35))'
      : 'rgba(0,0,0,.055)',
    boxShadow: on
      ? '0 0 22px rgba(201,162,39,.45)'
      : lit
      ? '0 0 20px rgba(236,203,90,.6)'
      : 'inset 0 -2px 0 rgba(0,0,0,.12)',
    transform: lit ? 'translateY(2px)' : 'none',
  };

  return (
    <div style={{ position: 'relative' }}>
      <button style={base} onClick={onClick} onMouseEnter={onHover} title={pad.desc || pad.label}>
        {hotkey && (
          <span className="mono" style={{ position: 'absolute', top: 3, right: 20, fontSize: 10, opacity: 0.4 }}>
            {hotkey}
          </span>
        )}

        <div className="row tight" style={{ justifyContent: tall ? 'flex-start' : 'center', marginBottom: tall ? 3 : 0 }}>
          <span style={{ fontSize: tall ? 20 : 22, lineHeight: 1 }}>{pad.glyph}</span>
          {busy && <span className="spinner" />}
          {on && !busy && <EqBars />}
        </div>

        <div
          style={{
            fontFamily: 'var(--font-head)',
            fontSize: tall ? 14.5 : 11.5,
            fontWeight: 600,
            letterSpacing: tall ? '.04em' : '.06em',
            textTransform: tall ? 'none' : 'uppercase',
            marginTop: tall ? 0 : 6,
            lineHeight: 1.2,
          }}
        >
          {pad.label}
        </div>

        {tall && (
          <div style={{ fontSize: 12.5, opacity: 0.72, lineHeight: 1.35, marginTop: 2 }}>{pad.desc}</div>
        )}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onCustomize(); }}
        title="Swap this sound or use your own file"
        style={{
          position: 'absolute', top: 2, right: 2,
          width: 18, height: 18, padding: 0, lineHeight: '16px',
          fontSize: 12, cursor: 'pointer',
          background: 'transparent', border: 'none',
          color: custom || swapped ? 'var(--oxblood)' : 'rgba(0,0,0,.35)',
          opacity: custom || swapped ? 1 : 0.6,
        }}
      >
        {custom ? '★' : swapped ? '✦' : '⋯'}
      </button>
    </div>
  );
}

function EqBars() {
  return (
    <span className="row tight" style={{ gap: 2, marginLeft: 'auto' }}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            width: 3, height: 12, background: '#2a1c04', borderRadius: 1,
            transformOrigin: 'bottom',
            animation: `eq 0.9s ${i * 0.13}s infinite ease-in-out`,
          }}
        />
      ))}
      <style>{`@keyframes eq { 0%,100% { transform: scaleY(.35) } 50% { transform: scaleY(1) } }`}</style>
    </span>
  );
}

/* ============================================================
   Swap / upload dialog
   ============================================================ */

function ChooserModal({ pad, lib, onClose, toast }) {
  const [list, setList] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const fileRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!pad) return;
    setList(null);
    library.fetchCandidates(pad.key).then(setList);
    return () => { audioRef.current?.pause(); };
  }, [pad?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pad) return null;

  const preview = (url, id) => {
    audioRef.current?.pause();
    const el = new Audio(url);
    el.volume = 0.85;
    el.play().catch(() => {});
    audioRef.current = el;
    setPreviewing(id);
    el.onended = () => setPreviewing(null);
  };

  const chosen = lib.choices[pad.key] ?? 0;
  const uploaded = lib.uploads.has(pad.key);

  return (
    <Modal open onClose={onClose} title={`${pad.glyph}  ${pad.label}`}>
      <p className="panel-sub" style={{ marginTop: 0 }}>
        {pad.desc || 'Pick the take you like, or drop in your own file.'}
      </p>

      {/* ---- your own file ---- */}
      <div
        style={{
          border: `1px solid ${uploaded ? 'var(--oxblood)' : 'rgba(0,0,0,.2)'}`,
          borderRadius: 3,
          padding: '11px 13px',
          background: uploaded ? 'rgba(109,27,27,.08)' : 'rgba(0,0,0,.04)',
        }}
      >
        <div className="row">
          <strong style={{ fontSize: 15 }}>
            {uploaded ? '★ Using your own file' : 'Use your own audio'}
          </strong>
          <span className="spacer" />
          <button className="btn xs" onClick={() => fileRef.current?.click()}>
            {uploaded ? 'Replace' : 'Choose file'}
          </button>
          {uploaded && (
            <button
              className="btn xs blood"
              onClick={async () => { await library.removeUpload(pad.key); toast('Reverted to the library sound.'); }}
            >
              Remove
            </button>
          )}
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>
          MP3, WAV, OGG, M4A. Stored in this browser only — it overrides everything below.
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            await library.upload(pad.key, f);
            toast(`${f.name} is now your ${pad.label}.`, 'success');
          }}
        />
      </div>

      <Rule />

      {/* ---- library candidates ---- */}
      {!lib.live ? (
        <Empty glyph="🔇">
          No sound library connected — this pad is using built-in synthesis.
          <div className="tiny" style={{ marginTop: 8 }}>
            Add a <span className="mono">FREESOUND_API_KEY</span> on the server for real recordings,
            or upload your own file above.
          </div>
        </Empty>
      ) : list === null ? (
        <Empty glyph="⏳">Searching the library…</Empty>
      ) : !list.length ? (
        <Empty glyph="🤷">
          Nothing suitable found for this one. It'll use synthesis — or upload your own above.
        </Empty>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {list.map((s, i) => {
            const active = i === chosen && !uploaded;
            return (
              <div
                key={s.id}
                className="row"
                style={{
                  padding: '8px 11px',
                  borderRadius: 3,
                  border: `1px solid ${active ? 'var(--gold)' : 'rgba(0,0,0,.15)'}`,
                  background: active ? 'rgba(201,162,39,.22)' : 'rgba(0,0,0,.04)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </div>
                  <div className="tiny muted">
                    {s.duration}s · by {s.author}
                    {s.rating ? ` · ★ ${s.rating}` : ''}
                  </div>
                </div>
                <button className="btn xs ghost" onClick={() => preview(s.url, s.id)}>
                  {previewing === s.id ? '♪ playing' : '▶ Preview'}
                </button>
                <button
                  className={`btn xs ${active ? 'gold' : ''}`}
                  onClick={() => { library.setChoice(pad.key, i); toast(`${pad.label} updated.`, 'success'); }}
                >
                  {active ? '✓ In use' : 'Use this'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Rule />
      <p className="tiny muted" style={{ margin: 0 }}>
        All library sounds are Creative Commons Zero — free to use, no attribution required.
      </p>
    </Modal>
  );
}
