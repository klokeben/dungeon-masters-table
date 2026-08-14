import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Panel, Rule, Empty, Field, Modal, HpBar, Tag, useToast, fmtClock, fmtDate, downloadText,
} from '../components/ui.jsx';
import { useStore, actions, getState, uid } from '../lib/store.js';
import { api } from '../lib/api.js';
import { SessionRecorder } from '../lib/recorder.js';

const CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated',
  'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained',
  'Stunned', 'Unconscious', 'Concentrating', 'Exhaustion 1', 'Exhaustion 2', 'Exhaustion 3',
];

export default function LiveSession({ goToTab }) {
  const live = useStore((s) => s.live);
  return live ? <Running goToTab={goToTab} /> : <Prep goToTab={goToTab} />;
}

/* ============================================================
   BEFORE THE SESSION
   ============================================================ */

function Prep({ goToTab }) {
  const characters = useStore((s) => s.characters);
  const sessions = useStore((s) => s.sessions);
  const campaign = useStore((s) => s.campaign);
  const last = sessions[0];
  const toast = useToast();

  const begin = () => {
    if (!SessionRecorder.supported) {
      toast('This browser cannot record audio — you can still run the session and take notes by hand.', 'error');
    }
    actions.startLive();
  };

  return (
    <>
      <Panel dark>
        <div className="row" style={{ gap: 22 }}>
          <div style={{ flex: '1 1 320px' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 30,
                margin: '0 0 6px',
                color: 'var(--gold-bright)',
              }}
            >
              Light the Candles
            </h2>
            <p className="muted" style={{ margin: '0 0 16px', maxWidth: 560 }}>
              Starting a session opens the table: the recorder listens and transcribes in the background,
              the party's hit points sit in front of you, and when you call it a night the whole thing is
              rendered into notes for next time.
            </p>
            <div className="row">
              <button className="btn gold" onClick={begin}>
                ⚔ Begin Session {sessions.length + 1}
              </button>
              {!characters.length && (
                <button className="btn ghost" onClick={() => goToTab('party')}>
                  Add the party first
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: '0 0 240px' }}>
            <div className="tiny muted" style={{ marginBottom: 6, letterSpacing: '.14em', textTransform: 'uppercase' }}>
              At the table
            </div>
            {characters.length ? (
              characters.map((c) => (
                <div key={c.id} className="row tight" style={{ justifyContent: 'space-between', fontSize: 14 }}>
                  <span>{c.name}</span>
                  <span className="muted">
                    {c.hp?.current ?? 0}/{c.hp?.max ?? 0}
                  </span>
                </div>
              ))
            ) : (
              <div className="tiny muted">No characters loaded.</div>
            )}
          </div>
        </div>
      </Panel>

      {last && (
        <Panel title="Where we left off" sub={`${last.title || 'Session'} — ${fmtDate(last.startedAt)}`}>
          {last.notes ? (
            <>
              <p className="drop-cap" style={{ marginTop: 0 }}>
                {last.notes.cliffhanger || last.notes.oneLine}
              </p>
              {!!last.notes.prepForNextTime?.length && (
                <>
                  <Rule />
                  <div className="panel-title" style={{ fontSize: 13 }}>
                    <span>Your prep list</span>
                    <span className="flourish" />
                  </div>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                    {last.notes.prepForNextTime.map((p, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
              {!!last.notes.threads?.filter((t) => t.status !== 'cold').length && (
                <>
                  <Rule />
                  <div className="row tight">
                    {last.notes.threads
                      .filter((t) => t.status !== 'cold')
                      .map((t, i) => (
                        <Tag key={i} tone={t.status === 'hot' ? 'blood' : 'gold'}>
                          {t.thread}
                        </Tag>
                      ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              That session hasn't been written up yet.{' '}
              <button className="btn xs ghost" onClick={() => goToTab('notes')}>
                Go synthesize it
              </button>
            </p>
          )}
        </Panel>
      )}

      <Panel title="Campaign" sub={campaign.setting}>
        <div className="row tight">
          <Tag>{campaign.tone}</Tag>
          <Tag>Level {campaign.level}</Tag>
          <Tag>{sessions.length} sessions logged</Tag>
          <Tag>{characters.length} characters</Tag>
        </div>
      </Panel>
    </>
  );
}

/* ============================================================
   DURING THE SESSION
   ============================================================ */

function Running({ goToTab }) {
  const live = useStore((s) => s.live);
  const characters = useStore((s) => s.characters);
  const campaign = useStore((s) => s.campaign);
  const settings = useStore((s) => s.settings);
  const toast = useToast();

  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [queue, setQueue] = useState(0); // chunks in flight
  const [scanning, setScanning] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [micError, setMicError] = useState(null);

  const recorderRef = useRef(null);
  const cfg = useRef({ settings, campaign, characters });
  cfg.current = { settings, campaign, characters };

  /* ---------- clock ---------- */
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - live.startedAt), 1000);
    return () => clearInterval(t);
  }, [live.startedAt]);

  /* ---------- transcript scanning for HP ---------- */
  const runScan = useCallback(async (force = false) => {
    const l = getState().live;
    if (!l) return;
    const text = l.unscanned.trim();
    const { settings: st, characters: chars } = cfg.current;
    if (!text || (!force && (!st.autoScanHp || text.length < 320))) return;
    if (!chars.length) return;

    setScanning(true);
    actions.patchLive({ unscanned: '' });
    try {
      const { events } = await api.combatScan({
        transcript: text,
        roster: chars.map((c) => ({
          name: c.name,
          current: c.hp?.current ?? 0,
          max: c.hp?.max ?? 0,
          temp: c.hp?.temp ?? 0,
          player: c.player,
        })),
      });

      const fresh = (events || []).map((e) => ({ ...e, id: uid() }));
      if (!fresh.length) return;

      const auto = [];
      const ask = [];
      for (const ev of fresh) {
        if (cfg.current.settings.autoApplyHigh && ev.confidence === 'high') auto.push(ev);
        else ask.push(ev);
      }
      auto.forEach((ev) => applyEvent(ev, cfg.current.characters, toast, true));
      if (ask.length) actions.patchLive((l2) => ({ pendingEvents: [...l2.pendingEvents, ...ask] }));
    } catch (e) {
      console.warn('HP scan failed:', e.message);
    } finally {
      setScanning(false);
    }
  }, [toast]);

  /* ---------- recorder ---------- */
  const startRecording = async () => {
    if (recorderRef.current) return;
    setMicError(null);
    const { settings: st, campaign: camp } = cfg.current;

    const rec = new SessionRecorder({
      chunkSeconds: st.chunkSeconds,
      onLevel: setLevel,
      onError: (e) => setMicError(e.message || String(e)),
      onChunk: async (blob) => {
        setQueue((q) => q + 1);
        try {
          const vocab = [
            camp.name,
            ...(camp.glossary || []),
            ...cfg.current.characters.map((c) => c.name),
          ]
            .filter(Boolean)
            .join(', ');
          const { text } = await api.transcribe(blob, { vocabulary: vocab });
          if (text) {
            actions.appendTranscript(text);
            runScan();
          }
        } catch (e) {
          toast(`Transcription failed: ${e.message}`, 'error');
        } finally {
          setQueue((q) => Math.max(0, q - 1));
        }
      },
    });

    try {
      await rec.start();
      recorderRef.current = rec;
      actions.patchLive({ recording: true });
      actions.logEvent({ kind: 'system', text: 'Recording started.' });
      toast('Recording. The table is being transcribed.', 'success');
    } catch (e) {
      setMicError(e.message);
      actions.patchLive({ micDeclined: true }); // don't nag on every re-render
      toast(e.message, 'error');
    }
  };

  const stopRecording = async () => {
    const rec = recorderRef.current;
    if (!rec) return null;
    recorderRef.current = null;
    const full = await rec.stop();
    actions.patchLive({ recording: false });
    actions.logEvent({ kind: 'system', text: 'Recording stopped.' });
    setLevel(0);
    return full;
  };

  // Never leave the mic open if this unmounts.
  useEffect(() => () => { recorderRef.current?.stop(); }, []);

  // Start listening the moment the session opens. Waiting for a second button
  // press means the first five minutes of every session go unrecorded.
  useEffect(() => {
    if (!live.recording && !recorderRef.current && !live.micDeclined) startRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- ending ---------- */
  const endSession = async ({ synthesize }) => {
    const audio = await stopRecording();
    await runScan(true);

    const l = getState().live;
    const transcript = l?.transcript || '';
    const session = actions.endLive();
    setEndOpen(false);

    if (audio) {
      const url = URL.createObjectURL(audio);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-${new Date(session.startedAt).toISOString().slice(0, 10)}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    goToTab('notes');

    if (synthesize && transcript.trim().length > 60) {
      toast('Writing up the session…');
      try {
        const st = getState();
        const previous = st.sessions[1]?.notes
          ? `${st.sessions[1].notes.recap}\n\nEnded on: ${st.sessions[1].notes.cliffhanger}`
          : '';
        const notes = await api.synthesize({
          transcript,
          campaign: st.campaign.name,
          roster: st.characters.map((c) => ({
            name: c.name, player: c.player, race: c.race, class: c.class, level: c.level,
          })),
          glossary: st.campaign.glossary,
          previous,
        });
        actions.updateSession(session.id, { notes, title: notes.title });
        toast('Session notes are ready.', 'success');
      } catch (e) {
        toast(`Could not write the notes: ${e.message}`, 'error');
      }
    }
  };

  const pending = live.pendingEvents || [];

  return (
    <>
      {/* ---------- control bar ---------- */}
      <Panel dark className="sticky-bar">
        <div className="row" style={{ gap: 16 }}>
          <div className="row tight" style={{ gap: 10 }}>
            <span
              style={{
                width: 12, height: 12, borderRadius: '50%',
                background: live.recording ? '#e23c3c' : '#5a5a5a',
                boxShadow: live.recording ? '0 0 10px #e23c3c' : 'none',
                animation: live.recording ? 'pulse 1.4s infinite' : 'none',
              }}
            />
            <span className="mono" style={{ fontSize: 19, color: 'var(--gold-bright)' }}>
              {fmtClock(elapsed)}
            </span>
          </div>

          <LevelMeter level={level} active={live.recording} />

          {!live.recording ? (
            <button className="btn blood" onClick={startRecording}>
              ● Start Recording
            </button>
          ) : (
            <>
              <button className="btn sm ghost" onClick={() => recorderRef.current?.flush()}>
                ⤓ Transcribe now
              </button>
              <button className="btn sm ghost" onClick={stopRecording}>
                ■ Stop mic
              </button>
            </>
          )}

          <span className="spacer" />

          {queue > 0 && (
            <span className="tiny muted row tight">
              <span className="spinner" /> transcribing {queue}
            </span>
          )}
          {scanning && (
            <span className="tiny muted row tight">
              <span className="spinner" /> reading the room
            </span>
          )}

          <button className="btn sm" onClick={() => runScan(true)} disabled={scanning}>
            ⚕ Scan for HP now
          </button>
          <button className="btn gold" onClick={() => setEndOpen(true)}>
            End Session
          </button>
        </div>

        {micError && (
          <p className="tiny" style={{ color: '#e59a9a', marginBottom: 0, marginTop: 10 }}>
            Microphone: {micError} — the session still runs, you'll just be taking notes by hand.
            Fix the permission and press Start Recording to pick it up mid-session.
          </p>
        )}
      </Panel>

      {/* ---------- pending HP suggestions ---------- */}
      {!!pending.length && (
        <Panel title="Heard at the table" sub="Confirm or dismiss — nothing is applied until you say so.">
          <div className="stack">
            {pending.map((ev) => (
              <PendingEvent key={ev.id} ev={ev} characters={characters} />
            ))}
          </div>
          <Rule />
          <div className="row">
            <button
              className="btn sm moss"
              onClick={() => {
                pending.forEach((ev) => applyEvent(ev, characters, toast));
                actions.patchLive({ pendingEvents: [] });
              }}
            >
              Apply all
            </button>
            <button className="btn sm ghost" onClick={() => actions.patchLive({ pendingEvents: [] })}>
              Dismiss all
            </button>
          </div>
        </Panel>
      )}

      {/* ---------- party ---------- */}
      <Panel
        title="The Party"
        right={
          characters.length ? (
            <div className="row tight">
              <button className="btn xs ghost" onClick={() => restAll('short', toast)}>
                Short rest
              </button>
              <button className="btn xs ghost" onClick={() => restAll('long', toast)}>
                Long rest
              </button>
            </div>
          ) : null
        }
      >
        {characters.length ? (
          <div className="grid three">
            {characters.map((c) => (
              <CombatCard key={c.id} c={c} />
            ))}
          </div>
        ) : (
          <Empty glyph="🛡️">
            No characters loaded. Upload sheets in <strong>The Party</strong> and their hit points appear here.
          </Empty>
        )}
      </Panel>

      <div className="grid two">
        <Initiative />
        <div>
          <Transcript live={live} />
          <SageBox />
        </div>
      </div>

      <EventLog live={live} />

      <Modal
        open={endOpen}
        onClose={() => setEndOpen(false)}
        title="End the session"
        footer={
          <>
            <button className="btn gold" onClick={() => endSession({ synthesize: true })}>
              End & write the notes
            </button>
            <button className="btn ghost" onClick={() => endSession({ synthesize: false })}>
              End without writing
            </button>
            <span className="spacer" />
            <button className="btn ghost" onClick={() => setEndOpen(false)}>
              Keep playing
            </button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>
          The transcript ({live.transcript.split(/\s+/).filter(Boolean).length.toLocaleString()} words) will be
          archived under <strong>Session Notes</strong>. If you write the notes now, Claude turns the transcript
          into a recap, open threads, NPCs met, loot, and a prep list for next time.
        </p>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          The full audio recording downloads to your computer as a backup.
        </p>
      </Modal>
    </>
  );
}

/* ============================================================
   Pieces
   ============================================================ */

function LevelMeter({ level, active }) {
  const bars = 14;
  const lit = Math.round(level * bars * 1.6);
  return (
    <div className="row tight" style={{ gap: 2 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: 6 + i * 1.1,
            borderRadius: 1,
            background:
              active && i < lit
                ? i > bars - 4
                  ? '#c94b2a'
                  : i > bars - 7
                  ? 'var(--gold-bright)'
                  : '#7aa04f'
                : 'rgba(255,255,255,.12)',
            transition: 'background .08s',
          }}
        />
      ))}
    </div>
  );
}

function applyEvent(ev, characters, toast, silent) {
  const target = characters.find(
    (c) => c.name?.toLowerCase().trim() === String(ev.character || '').toLowerCase().trim()
  );
  if (!target) {
    if (!silent) toast?.(`No character named "${ev.character}" on the roster.`, 'error');
    return;
  }
  const amt = Math.abs(Number(ev.amount) || 0);

  if (ev.kind === 'damage') actions.applyHp(target.id, -amt);
  else if (ev.kind === 'heal') actions.applyHp(target.id, amt);
  else if (ev.kind === 'temp') actions.applyHp(target.id, 0, { setTemp: amt });
  else if (ev.kind === 'down')
    actions.updateCharacter(target.id, (c) => ({
      hp: { ...c.hp, current: 0 },
      conditions: [...new Set([...(c.conditions || []), 'Unconscious'])],
    }));
  else if (ev.kind === 'stabilize')
    actions.updateCharacter(target.id, { deathSaves: { successes: 3, failures: 0 } });
  else if (ev.kind === 'rest')
    actions.updateCharacter(target.id, (c) => ({ hp: { ...c.hp, current: c.hp.max, temp: 0 } }));

  actions.logEvent({
    kind: ev.kind,
    text: `${target.name}: ${ev.kind} ${amt || ''}`.trim(),
    quote: ev.quote,
    auto: !!silent,
  });
}

function PendingEvent({ ev, characters }) {
  const toast = useToast();
  const dismiss = () =>
    actions.patchLive((l) => ({ pendingEvents: l.pendingEvents.filter((p) => p.id !== ev.id) }));

  const tone = { high: 'moss', medium: 'gold', low: 'blood' }[ev.confidence] || 'gold';
  const verb = {
    damage: 'takes', heal: 'is healed for', temp: 'gains temp HP', down: 'goes down',
    stabilize: 'stabilizes', death: 'dies', rest: 'rests',
  }[ev.kind] || ev.kind;

  return (
    <div
      style={{
        border: '1px solid rgba(0,0,0,.22)',
        borderLeft: `4px solid ${ev.kind === 'heal' ? 'var(--hp-full)' : 'var(--oxblood)'}`,
        borderRadius: 3,
        padding: '10px 13px',
        background: 'rgba(0,0,0,.05)',
      }}
    >
      <div className="row">
        <strong style={{ fontSize: 17 }}>
          {ev.character} {verb} {ev.amount ? <strong>{ev.amount}</strong> : null}
        </strong>
        <Tag tone={tone}>{ev.confidence} confidence</Tag>
        <span className="spacer" />
        <button
          className="btn xs moss"
          onClick={() => {
            applyEvent(ev, characters, toast);
            dismiss();
          }}
        >
          ✓ Apply
        </button>
        <button className="btn xs ghost" onClick={dismiss}>
          ✕ Ignore
        </button>
      </div>
      {ev.quote && (
        <div className="tiny muted" style={{ fontStyle: 'italic', marginTop: 5 }}>
          “…{ev.quote}…”
        </div>
      )}
    </div>
  );
}

function CombatCard({ c }) {
  const [amount, setAmount] = useState('');
  const [condOpen, setCondOpen] = useState(false);
  const hp = c.hp || { current: 0, max: 0, temp: 0 };
  const down = hp.current <= 0;

  const apply = (sign) => {
    const n = parseInt(amount, 10);
    if (!n || Number.isNaN(n)) return;
    actions.applyHp(c.id, sign * n);
    actions.logEvent({ kind: sign > 0 ? 'heal' : 'damage', text: `${c.name}: ${sign > 0 ? '+' : '−'}${n} HP`, manual: true });
    setAmount('');
  };

  const toggleCond = (cond) =>
    actions.updateCharacter(c.id, (x) => ({
      conditions: (x.conditions || []).includes(cond)
        ? x.conditions.filter((y) => y !== cond)
        : [...(x.conditions || []), cond],
    }));

  return (
    <div
      style={{
        border: `1px solid ${down ? 'var(--oxblood)' : 'rgba(0,0,0,.25)'}`,
        borderRadius: 3,
        padding: '12px 13px',
        background: down ? 'rgba(109,27,27,.1)' : 'rgba(0,0,0,.05)',
        opacity: down ? 0.92 : 1,
      }}
    >
      <div className="row" style={{ marginBottom: 3 }}>
        <strong style={{ fontFamily: 'var(--font-head)', fontSize: 16, letterSpacing: '.02em' }}>
          {c.name}
        </strong>
        <span className="spacer" />
        <span className="tiny muted">
          AC {c.ac ?? '—'}
        </span>
      </div>
      <div className="tiny muted" style={{ marginBottom: 8 }}>
        {[c.race, c.class, c.level && `lv ${c.level}`].filter(Boolean).join(' · ')}
        {c.player ? ` — ${c.player}` : ''}
      </div>

      <div className="row" style={{ marginBottom: 5, alignItems: 'baseline' }}>
        <span style={{ fontSize: 25, fontWeight: 600, color: down ? 'var(--oxblood)' : 'inherit' }}>
          {hp.current}
        </span>
        <span className="muted">/ {hp.max}</span>
        {hp.temp > 0 && <Tag tone="arcane">+{hp.temp} temp</Tag>}
        <span className="spacer" />
        {down && <Tag tone="blood">Down</Tag>}
      </div>

      <HpBar current={hp.current} max={hp.max} temp={hp.temp} />

      <div className="row tight" style={{ marginTop: 9 }}>
        <button className="btn xs blood" onClick={() => actions.applyHp(c.id, -1)}>−1</button>
        <button className="btn xs blood" onClick={() => actions.applyHp(c.id, -5)}>−5</button>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply(e.shiftKey ? 1 : -1)}
          placeholder="0"
          style={{ width: 56, padding: '3px 6px', fontSize: 14, textAlign: 'center' }}
          title="Enter = damage · Shift+Enter = heal"
        />
        <button className="btn xs blood" onClick={() => apply(-1)}>Dmg</button>
        <button className="btn xs moss" onClick={() => apply(1)}>Heal</button>
        <span className="spacer" />
        <button
          className="btn xs ghost"
          title="Full HP"
          onClick={() => actions.updateCharacter(c.id, (x) => ({ hp: { ...x.hp, current: x.hp.max, temp: 0 } }))}
        >
          ⟳
        </button>
      </div>

      {down && (
        <div className="row tight" style={{ marginTop: 9, alignItems: 'center' }}>
          <span className="tiny" style={{ letterSpacing: '.1em', textTransform: 'uppercase' }}>Death</span>
          {['successes', 'failures'].map((k) => (
            <span key={k} className="row tight" style={{ gap: 3 }}>
              <span className="tiny muted">{k === 'successes' ? '✓' : '✕'}</span>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() =>
                    actions.updateCharacter(c.id, (x) => ({
                      deathSaves: {
                        ...x.deathSaves,
                        [k]: (x.deathSaves?.[k] || 0) >= n ? n - 1 : n,
                      },
                    }))
                  }
                  style={{
                    width: 15, height: 15, borderRadius: '50%', cursor: 'pointer', padding: 0,
                    border: '1px solid rgba(0,0,0,.4)',
                    background:
                      (c.deathSaves?.[k] || 0) >= n
                        ? k === 'successes' ? 'var(--hp-full)' : 'var(--oxblood)'
                        : 'rgba(0,0,0,.15)',
                  }}
                />
              ))}
            </span>
          ))}
        </div>
      )}

      <div className="row tight" style={{ marginTop: 9 }}>
        {(c.conditions || []).map((cd) => (
          <button key={cd} className="btn xs blood" onClick={() => toggleCond(cd)} title="Click to clear">
            {cd} ✕
          </button>
        ))}
        <button className="btn xs ghost" onClick={() => setCondOpen(true)}>
          + Condition
        </button>
      </div>

      <Modal open={condOpen} onClose={() => setCondOpen(false)} title={`${c.name} — conditions`}>
        <div className="row tight">
          {CONDITIONS.map((cd) => (
            <button
              key={cd}
              className={`btn sm ${(c.conditions || []).includes(cd) ? 'blood' : 'ghost'}`}
              onClick={() => toggleCond(cd)}
            >
              {cd}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function restAll(kind, toast) {
  getState().characters.forEach((c) => {
    if (kind === 'long') {
      actions.updateCharacter(c.id, (x) => ({
        hp: { ...x.hp, current: x.hp.max, temp: 0 },
        conditions: (x.conditions || []).filter((cd) => !cd.startsWith('Exhaustion')),
        deathSaves: { successes: 0, failures: 0 },
      }));
    } else {
      actions.updateCharacter(c.id, () => ({ deathSaves: { successes: 0, failures: 0 } }));
    }
  });
  actions.logEvent({ kind: 'rest', text: `${kind === 'long' ? 'Long' : 'Short'} rest taken.` });
  toast(kind === 'long' ? 'Long rest — the party is whole again.' : 'Short rest — spend those hit dice.', 'success');
}

/* ---------- initiative ---------- */

function Initiative() {
  const live = useStore((s) => s.live);
  const characters = useStore((s) => s.characters);
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');

  const order = [...(live.initiative || [])].sort((a, b) => b.roll - a.roll);

  const add = (n, r, isPc, ac, hp) => {
    if (!n) return;
    actions.patchLive((l) => ({
      initiative: [...l.initiative, { id: uid(), name: n, roll: Number(r) || 0, isPc, ac, hp, done: false }],
    }));
  };

  const next = () =>
    actions.patchLive((l) => {
      const len = (l.initiative || []).length || 1;
      const idx = (l.turnIndex + 1) % len;
      return { turnIndex: idx, round: idx === 0 ? l.round + 1 : l.round || 1 };
    });

  return (
    <Panel
      title="Initiative"
      right={
        order.length ? (
          <div className="row tight">
            <Tag>Round {live.round || 1}</Tag>
            <button className="btn xs gold" onClick={next}>Next turn ▸</button>
            <button
              className="btn xs ghost"
              onClick={() => actions.patchLive({ initiative: [], round: 0, turnIndex: 0 })}
            >
              Clear
            </button>
          </div>
        ) : null
      }
    >
      <div className="row tight" style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Combatant"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 2, minWidth: 120 }}
        />
        <input
          type="number"
          placeholder="Init"
          value={roll}
          onChange={(e) => setRoll(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              add(name, roll, false);
              setName('');
              setRoll('');
            }
          }}
          style={{ width: 74 }}
        />
        <button
          className="btn sm"
          onClick={() => {
            add(name, roll, false);
            setName('');
            setRoll('');
          }}
        >
          Add
        </button>
        <button
          className="btn sm ghost"
          title="Roll initiative for every monster you've added at 0"
          onClick={() =>
            actions.patchLive((l) => ({
              initiative: l.initiative.map((x) =>
                x.roll ? x : { ...x, roll: Math.ceil(Math.random() * 20) }
              ),
            }))
          }
        >
          🎲 Roll blanks
        </button>
      </div>

      {!!characters.length && (
        <div className="row tight" style={{ marginBottom: 12 }}>
          <span className="tiny muted">Add party:</span>
          {characters.map((c) => (
            <button
              key={c.id}
              className="btn xs ghost"
              disabled={(live.initiative || []).some((i) => i.name === c.name)}
              onClick={() =>
                add(c.name, (c.initiative ?? 0) + Math.ceil(Math.random() * 20), true, c.ac, c.hp)
              }
            >
              + {c.name}
            </button>
          ))}
        </div>
      )}

      {order.length ? (
        <div className="stack" style={{ gap: 4 }}>
          {order.map((x, i) => {
            const active = i === (live.turnIndex % order.length);
            return (
              <div
                key={x.id}
                className="row"
                style={{
                  padding: '7px 11px',
                  borderRadius: 3,
                  background: active ? 'rgba(201,162,39,.28)' : 'rgba(0,0,0,.05)',
                  border: `1px solid ${active ? 'var(--gold)' : 'rgba(0,0,0,.14)'}`,
                  boxShadow: active ? 'inset 0 0 18px rgba(201,162,39,.2)' : 'none',
                }}
              >
                <span
                  className="mono"
                  style={{ width: 26, fontSize: 15, fontWeight: 700, color: 'var(--oxblood)' }}
                >
                  {x.roll}
                </span>
                <strong style={{ fontSize: 15 }}>{x.name}</strong>
                {x.isPc && <Tag tone="moss">PC</Tag>}
                {x.ac ? <span className="tiny muted">AC {x.ac}</span> : null}
                <span className="spacer" />
                {active && <Tag tone="blood">◂ acting</Tag>}
                <button
                  className="btn xs ghost"
                  onClick={() =>
                    actions.patchLive((l) => ({ initiative: l.initiative.filter((y) => y.id !== x.id) }))
                  }
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty glyph="⚔️">Roll for initiative.</Empty>
      )}
    </Panel>
  );
}

/* ---------- transcript ---------- */

function Transcript({ live }) {
  const [note, setNote] = useState('');
  const boxRef = useRef(null);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [live.transcript]);

  const words = live.transcript.split(/\s+/).filter(Boolean).length;

  return (
    <Panel
      title="Transcript"
      right={<span className="tiny muted">{words.toLocaleString()} words</span>}
    >
      <div
        ref={boxRef}
        style={{
          maxHeight: 260,
          overflowY: 'auto',
          background: 'rgba(0,0,0,.055)',
          border: '1px solid rgba(0,0,0,.16)',
          borderRadius: 3,
          padding: '12px 14px',
          fontSize: 15,
          lineHeight: 1.62,
          whiteSpace: 'pre-wrap',
        }}
      >
        {live.transcript || (
          <span className="muted" style={{ fontStyle: 'italic' }}>
            Nothing transcribed yet. Start recording, or type notes below — everything here feeds the write-up.
          </span>
        )}
      </div>

      <div className="row tight" style={{ marginTop: 10 }}>
        <input
          type="text"
          placeholder="Type a note into the record…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && note.trim()) {
              actions.appendTranscript(`[DM note: ${note.trim()}]`);
              actions.logEvent({ kind: 'note', text: note.trim() });
              setNote('');
            }
          }}
        />
        <button
          className="btn sm"
          onClick={() => {
            if (!note.trim()) return;
            actions.appendTranscript(`[DM note: ${note.trim()}]`);
            actions.logEvent({ kind: 'note', text: note.trim() });
            setNote('');
          }}
        >
          Add
        </button>
      </div>
    </Panel>
  );
}

/* ---------- rules lookup ---------- */

function SageBox() {
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const ask = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setA('');
    try {
      const { answer } = await api.ask(q, `Campaign: ${getState().campaign.name}. Mid-session, need a fast ruling.`);
      setA(answer);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Ask the Sage" sub="A fast 5e ruling while the table waits.">
      <div className="row tight">
        <input
          type="text"
          placeholder="Can you shove a creature two sizes larger?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
        />
        <button className="btn sm gold" onClick={ask} disabled={busy}>
          {busy ? <span className="spinner" /> : 'Ask'}
        </button>
      </div>
      {a && (
        <p style={{ marginBottom: 0, marginTop: 12, fontSize: 15.5, whiteSpace: 'pre-wrap' }}>{a}</p>
      )}
    </Panel>
  );
}

/* ---------- event log ---------- */

function EventLog({ live }) {
  const log = live.eventLog || [];
  if (!log.length) return null;

  const glyph = { damage: '🗡️', heal: '💚', temp: '🔵', down: '💀', rest: '🏕️', note: '✒️', system: '⚙' };

  return (
    <Panel
      title="Session Log"
      right={
        <button
          className="btn xs ghost"
          onClick={() =>
            downloadText(
              `session-log-${Date.now()}.txt`,
              log
                .slice()
                .reverse()
                .map((e) => `${new Date(e.at).toLocaleTimeString()}  ${e.text}`)
                .join('\n')
            )
          }
        >
          ⬇ Export
        </button>
      }
    >
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {log.map((e) => (
          <div key={e.id} className="row tight" style={{ fontSize: 14, padding: '3px 0' }}>
            <span className="mono muted" style={{ fontSize: 12 }}>
              {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span>{glyph[e.kind] || '•'}</span>
            <span>{e.text}</span>
            {e.auto && <Tag tone="gold">auto</Tag>}
            {e.quote && <span className="tiny muted" style={{ fontStyle: 'italic' }}>“{e.quote}”</span>}
          </div>
        ))}
      </div>
    </Panel>
  );
}
