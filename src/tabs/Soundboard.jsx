import React, { useEffect, useState } from 'react';
import { Panel, Rule, Tag } from '../components/ui.jsx';
import { engine, AMBIENCES, SFX } from '../lib/audio.js';
import { useStore, actions } from '../lib/store.js';

export default function Soundboard() {
  const settings = useStore((s) => s.settings);
  const [playing, setPlaying] = useState(null);
  const [flash, setFlash] = useState(null);
  const [ambVol, setAmbVol] = useState(0.55);

  useEffect(() => {
    engine.setVolume(settings.masterVolume);
  }, [settings.masterVolume]);

  useEffect(() => {
    engine.ambienceVolume = ambVol;
    if (engine.current) {
      engine.current.bus.gain.setTargetAtTime(ambVol, engine.ctx.currentTime, 0.2);
    }
  }, [ambVol]);

  const groups = [...new Set(SFX.map((s) => s.group))];
  const hotkeyed = SFX.slice(0, 9);

  const fire = (key) => {
    engine.playSfx(key);
    setFlash(key);
    setTimeout(() => setFlash((f) => (f === key ? null : f)), 260);
  };

  const toggleAmbience = (key) => {
    engine.playAmbience(key);
    setPlaying(engine.playing);
  };

  // number keys fire the first nine effects
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const i = parseInt(e.key, 10) - 1;
      if (i >= 0 && i < hotkeyed.length && !e.altKey && !e.metaKey && !e.ctrlKey) {
        fire(hotkeyed[i].key);
      }
      if (e.key === 'Escape') {
        engine.stopAmbience();
        setPlaying(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Panel dark title="Soundboard" sub="Every sound here is synthesized in your browser — nothing to download, nothing to license.">
        <div className="row" style={{ gap: 20 }}>
          <label className="row tight" style={{ flex: '1 1 220px', gap: 10 }}>
            <span className="tiny" style={{ letterSpacing: '.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Master
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.masterVolume}
              onChange={(e) => actions.updateSettings({ masterVolume: Number(e.target.value) })}
            />
          </label>

          <label className="row tight" style={{ flex: '1 1 220px', gap: 10 }}>
            <span className="tiny" style={{ letterSpacing: '.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Ambience
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={ambVol}
              onChange={(e) => setAmbVol(Number(e.target.value))}
            />
          </label>

          <span className="spacer" />

          {playing && (
            <button
              className="btn sm blood"
              onClick={() => { engine.stopAmbience(); setPlaying(null); }}
            >
              ■ Silence (Esc)
            </button>
          )}
        </div>
      </Panel>

      {/* ---------- ambience ---------- */}
      <Panel title="Set the Scene" sub="One at a time — picking a new one crossfades. Click again to stop.">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(196px, 1fr))', gap: 10 }}>
          {AMBIENCES.map((a) => {
            const on = playing === a.key;
            return (
              <button
                key={a.key}
                onClick={() => toggleAmbience(a.key)}
                style={{
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                  color: on ? '#2a1c04' : 'var(--ink)',
                  padding: '13px 14px',
                  borderRadius: 3,
                  position: 'relative',
                  overflow: 'hidden',
                  border: `1px solid ${on ? 'var(--gold-bright)' : 'rgba(0,0,0,.22)'}`,
                  background: on
                    ? 'linear-gradient(180deg, var(--gold-bright), var(--gold))'
                    : 'rgba(0,0,0,.055)',
                  boxShadow: on ? '0 0 22px rgba(201,162,39,.45)' : 'none',
                  transition: 'all .18s',
                }}
              >
                <div className="row tight" style={{ marginBottom: 3 }}>
                  <span style={{ fontSize: 20 }}>{a.glyph}</span>
                  {on && <EqBars />}
                </div>
                <div style={{ fontFamily: 'var(--font-head)', fontSize: 14.5, fontWeight: 600, letterSpacing: '.04em' }}>
                  {a.label}
                </div>
                <div style={{ fontSize: 12.5, opacity: 0.72, lineHeight: 1.35, marginTop: 2 }}>{a.desc}</div>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* ---------- sfx ---------- */}
      {groups.map((g) => (
        <Panel key={g} title={g}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 8 }}>
            {SFX.filter((s) => s.group === g).map((s) => {
              const hot = hotkeyed.findIndex((h) => h.key === s.key);
              const lit = flash === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => fire(s.key)}
                  style={{
                    cursor: 'pointer',
                    font: 'inherit',
                    color: 'var(--ink)',
                    padding: '12px 8px 10px',
                    borderRadius: 3,
                    textAlign: 'center',
                    position: 'relative',
                    border: `1px solid ${lit ? 'var(--gold-bright)' : 'rgba(0,0,0,.22)'}`,
                    background: lit
                      ? 'radial-gradient(circle at 50% 40%, rgba(236,203,90,.85), rgba(201,162,39,.35))'
                      : 'rgba(0,0,0,.055)',
                    boxShadow: lit ? '0 0 20px rgba(236,203,90,.6)' : 'inset 0 -2px 0 rgba(0,0,0,.12)',
                    transform: lit ? 'translateY(2px)' : 'none',
                    transition: 'all .1s',
                  }}
                >
                  {hot >= 0 && (
                    <span
                      className="mono"
                      style={{
                        position: 'absolute', top: 3, right: 5, fontSize: 10, opacity: 0.4,
                      }}
                    >
                      {hot + 1}
                    </span>
                  )}
                  <div style={{ fontSize: 22, lineHeight: 1 }}>{s.glyph}</div>
                  <div
                    style={{
                      fontFamily: 'var(--font-head)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      letterSpacing: '.06em',
                      textTransform: 'uppercase',
                      marginTop: 6,
                      lineHeight: 1.2,
                    }}
                  >
                    {s.label}
                  </div>
                </button>
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
          <span className="tiny muted">
            Sound keeps playing while you work in other tabs.
          </span>
        </div>
      </Panel>
    </>
  );
}

function EqBars() {
  return (
    <span className="row tight" style={{ gap: 2, marginLeft: 'auto' }}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: 12,
            background: '#2a1c04',
            borderRadius: 1,
            transformOrigin: 'bottom',
            animation: `eq 0.9s ${i * 0.13}s infinite ease-in-out`,
          }}
        />
      ))}
      <style>{`@keyframes eq { 0%,100% { transform: scaleY(.35) } 50% { transform: scaleY(1) } }`}</style>
    </span>
  );
}
