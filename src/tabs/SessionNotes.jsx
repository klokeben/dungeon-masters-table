import React, { useState, useRef } from 'react';
import {
  Panel, Rule, Empty, Tag, Modal, useToast, fmtDate, fmtDuration, downloadText, copyText,
} from '../components/ui.jsx';
import { useStore, actions, getState } from '../lib/store.js';
import { api } from '../lib/api.js';

export default function SessionNotes() {
  const sessions = useStore((s) => s.sessions);
  const [selectedId, setSelectedId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const toast = useToast();

  const selected = sessions.find((s) => s.id === selectedId) || sessions[0] || null;

  const synthesize = async (session) => {
    if (!session.transcript?.trim()) {
      toast('That session has no transcript to work from.', 'error');
      return;
    }
    setBusyId(session.id);
    try {
      const st = getState();
      const idx = st.sessions.findIndex((x) => x.id === session.id);
      const prev = st.sessions[idx + 1];
      const notes = await api.synthesize({
        transcript: session.transcript,
        campaign: st.campaign.name,
        roster: st.characters.map((c) => ({
          name: c.name, player: c.player, race: c.race, class: c.class, level: c.level,
        })),
        glossary: st.campaign.glossary,
        previous: prev?.notes ? `${prev.notes.recap}\n\nEnded on: ${prev.notes.cliffhanger}` : '',
      });
      actions.updateSession(session.id, { notes, title: notes.title });
      // learn the proper nouns for next time
      actions.addGlossaryTerms([
        ...(notes.npcsMet || []).map((n) => n.name),
        ...(notes.locations || []).map((l) => l.name),
      ]);
      setSelectedId(session.id);
      toast('The scribe has finished.', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Panel dark>
        <div className="row">
          <div>
            <div className="panel-title" style={{ margin: 0 }}>
              <span>The Chronicle</span>
            </div>
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              {sessions.length} session{sessions.length === 1 ? '' : 's'} recorded ·{' '}
              {sessions.filter((s) => s.notes).length} written up
            </p>
          </div>
          <span className="spacer" />
          <button className="btn gold sm" onClick={() => setImportOpen(true)}>
            ＋ Import a recording or transcript
          </button>
        </div>
      </Panel>

      {!sessions.length ? (
        <Empty glyph="📜">
          No sessions yet. Run one from the <strong>Live Session</strong> tab, or import an old recording.
        </Empty>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(230px, 300px) 1fr', alignItems: 'start' }}>
          <Panel title="Sessions" style={{ position: 'sticky', top: 0 }}>
            <div className="stack" style={{ gap: 6 }}>
              {sessions.map((s, i) => {
                const active = selected?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    style={{
                      textAlign: 'left',
                      cursor: 'pointer',
                      padding: '9px 11px',
                      borderRadius: 3,
                      border: `1px solid ${active ? 'var(--gold)' : 'rgba(0,0,0,.16)'}`,
                      background: active ? 'rgba(201,162,39,.24)' : 'rgba(0,0,0,.04)',
                      color: 'var(--ink)',
                      font: 'inherit',
                    }}
                  >
                    <div className="row tight" style={{ justifyContent: 'space-between' }}>
                      <span className="tiny muted">Session {sessions.length - i}</span>
                      {!s.notes && <Tag tone="blood">unwritten</Tag>}
                    </div>
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: 14.5, lineHeight: 1.25, margin: '2px 0' }}>
                      {s.title || 'Untitled session'}
                    </div>
                    <div className="tiny muted">
                      {fmtDate(s.startedAt)}
                      {s.endedAt ? ` · ${fmtDuration(s.endedAt - s.startedAt)}` : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <div>
            {selected && (
              <SessionView
                session={selected}
                busy={busyId === selected.id}
                onSynthesize={() => synthesize(selected)}
                onDelete={() => {
                  if (confirm('Delete this session and its transcript?')) {
                    actions.removeSession(selected.id);
                    setSelectedId(null);
                  }
                }}
              />
            )}
          </div>
        </div>
      )}

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSynthesize={synthesize} />
    </>
  );
}

/* ============================================================
   One session, rendered
   ============================================================ */

function SessionView({ session, busy, onSynthesize, onDelete }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const n = session.notes;

  const exportMarkdown = () => {
    if (!n) return;
    const md = [
      `# ${n.title}`,
      `*${fmtDate(session.startedAt)}*`,
      '',
      `> ${n.oneLine}`,
      '',
      '## Recap',
      n.recap,
      '',
      n.cliffhanger ? `## Where we stopped\n${n.cliffhanger}\n` : '',
      n.threads?.length
        ? `## Open threads\n${n.threads.map((t) => `- **${t.thread}** *(${t.status})* — ${t.nextStep}`).join('\n')}\n`
        : '',
      n.npcsMet?.length
        ? `## NPCs\n${n.npcsMet.map((x) => `- **${x.name}** (${x.role}, ${x.disposition}) — ${x.note}`).join('\n')}\n`
        : '',
      n.locations?.length ? `## Locations\n${n.locations.map((x) => `- **${x.name}** — ${x.note}`).join('\n')}\n` : '',
      n.loot?.length ? `## Loot\n${n.loot.map((x) => `- ${x}`).join('\n')}\n` : '',
      n.decisions?.length ? `## Decisions\n${n.decisions.map((x) => `- ${x}`).join('\n')}\n` : '',
      n.prepForNextTime?.length ? `## Prep for next time\n${n.prepForNextTime.map((x) => `- ${x}`).join('\n')}\n` : '',
    ]
      .filter(Boolean)
      .join('\n');
    downloadText(`${(n.title || 'session').replace(/[^\w -]/g, '')}.md`, md, 'text/markdown');
  };

  return (
    <>
      <Panel
        title={n?.title || 'Untitled session'}
        sub={`${fmtDate(session.startedAt)}${session.endedAt ? ` · ${fmtDuration(session.endedAt - session.startedAt)}` : ''} · ${
          (session.transcript || '').split(/\s+/).filter(Boolean).length.toLocaleString()
        } words transcribed`}
        right={
          <div className="row tight">
            {n && <button className="btn xs ghost" onClick={exportMarkdown}>⬇ .md</button>}
            <button className="btn xs ghost" onClick={() => setShowTranscript(true)}>Transcript</button>
            <button className="btn xs" onClick={onSynthesize} disabled={busy}>
              {busy ? <span className="spinner" /> : n ? '↻ Rewrite' : '✒ Write it up'}
            </button>
            <button className="btn xs blood" onClick={onDelete}>Delete</button>
          </div>
        }
      >
        {!n ? (
          <Empty glyph="✒️">
            This session hasn't been written up yet.
            <div style={{ marginTop: 14 }}>
              <button className="btn gold" onClick={onSynthesize} disabled={busy}>
                {busy ? 'The scribe is working…' : 'Write it up'}
              </button>
            </div>
          </Empty>
        ) : (
          <>
            <p style={{ fontFamily: 'var(--font-head)', fontSize: 17, fontStyle: 'italic', marginTop: 0 }}>
              {n.oneLine}
            </p>
            <Rule />
            <div className="drop-cap" style={{ fontSize: 17, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {n.recap}
            </div>
            {n.cliffhanger && (
              <>
                <Rule />
                <div
                  style={{
                    borderLeft: '4px solid var(--oxblood)',
                    paddingLeft: 14,
                    fontStyle: 'italic',
                    fontSize: 16.5,
                  }}
                >
                  <strong style={{ fontFamily: 'var(--font-head)', fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', display: 'block', opacity: .7 }}>
                    We stopped here
                  </strong>
                  {n.cliffhanger}
                </div>
              </>
            )}
          </>
        )}
      </Panel>

      {n && (
        <>
          {!!n.prepForNextTime?.length && (
            <Panel dark title="Prep for next time" sub="Ordered by what matters most.">
              <ol style={{ margin: 0, paddingLeft: 22, fontSize: 16, lineHeight: 1.7 }}>
                {n.prepForNextTime.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>
              <Rule />
              <button
                className="btn sm ghost"
                onClick={() => copyText(n.prepForNextTime.map((p) => `- ${p}`).join('\n'))}
              >
                Copy list
              </button>
            </Panel>
          )}

          <div className="grid two">
            {!!n.threads?.length && (
              <Panel title="Open threads">
                <div className="stack" style={{ gap: 10 }}>
                  {n.threads.map((t, i) => (
                    <div key={i}>
                      <div className="row tight">
                        <strong style={{ fontSize: 15.5 }}>{t.thread}</strong>
                        <Tag tone={t.status === 'hot' ? 'blood' : t.status === 'warm' ? 'gold' : 'moss'}>
                          {t.status}
                        </Tag>
                      </div>
                      <div className="tiny muted">{t.nextStep}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {!!n.npcsMet?.length && (
              <Panel title="NPCs met">
                <div className="stack" style={{ gap: 9 }}>
                  {n.npcsMet.map((x, i) => (
                    <div key={i}>
                      <div className="row tight">
                        <strong style={{ fontSize: 15.5 }}>{x.name}</strong>
                        <span className="tiny muted">{x.role}</span>
                        <Tag tone={x.disposition === 'hostile' ? 'blood' : x.disposition === 'friendly' ? 'moss' : 'gold'}>
                          {x.disposition}
                        </Tag>
                      </div>
                      <div className="tiny muted">{x.note}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {!!n.partyActions?.length && (
              <Panel title="What the party did">
                <div className="stack" style={{ gap: 9 }}>
                  {n.partyActions.map((x, i) => (
                    <div key={i}>
                      <strong style={{ fontFamily: 'var(--font-head)', fontSize: 14.5 }}>{x.character}</strong>
                      <div style={{ fontSize: 15 }}>{x.did}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {(!!n.loot?.length || !!n.locations?.length) && (
              <Panel title="Spoils & places">
                {!!n.loot?.length && (
                  <>
                    <div className="tiny muted" style={{ letterSpacing: '.14em', textTransform: 'uppercase' }}>Loot</div>
                    <ul style={{ margin: '4px 0 12px', paddingLeft: 20 }}>
                      {n.loot.map((l, i) => <li key={i}>{l}</li>)}
                    </ul>
                  </>
                )}
                {!!n.locations?.length && (
                  <>
                    <div className="tiny muted" style={{ letterSpacing: '.14em', textTransform: 'uppercase' }}>Locations</div>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                      {n.locations.map((l, i) => (
                        <li key={i}><strong>{l.name}</strong> — {l.note}</li>
                      ))}
                    </ul>
                  </>
                )}
              </Panel>
            )}

            {!!n.combats?.length && (
              <Panel title="Blood spilled">
                <div className="stack" style={{ gap: 9 }}>
                  {n.combats.map((c, i) => (
                    <div key={i}>
                      <strong style={{ fontSize: 15.5 }}>{c.what}</strong>
                      <div className="tiny">{c.outcome}</div>
                      {c.cost && <div className="tiny muted">Cost: {c.cost}</div>}
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {!!n.decisions?.length && (
              <Panel title="Decisions with consequences">
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {n.decisions.map((d, i) => <li key={i} style={{ marginBottom: 5 }}>{d}</li>)}
                </ul>
              </Panel>
            )}

            {!!n.playerQuotes?.length && (
              <Panel title="Quotes for the ages">
                <div className="stack" style={{ gap: 10 }}>
                  {n.playerQuotes.map((q, i) => (
                    <div key={i} style={{ fontStyle: 'italic', fontSize: 16, borderLeft: '3px solid var(--gold-dim)', paddingLeft: 12 }}>
                      “{q}”
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {!!n.timeline?.length && (
              <Panel title="Timeline">
                <div className="stack" style={{ gap: 5 }}>
                  {n.timeline.map((t, i) => (
                    <div key={i} className="row tight" style={{ alignItems: 'flex-start' }}>
                      <span className="mono muted" style={{ minWidth: 42, fontSize: 12 }}>{t.time || '—'}</span>
                      <span style={{ fontSize: 15 }}>{t.event}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>

          {!!n.gaps?.length && (
            <Panel title="The scribe wasn't sure about" sub="Fill these in from memory while it's fresh.">
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {n.gaps.map((g, i) => <li key={i} style={{ marginBottom: 4 }}>{g}</li>)}
              </ul>
            </Panel>
          )}
        </>
      )}

      <Modal open={showTranscript} onClose={() => setShowTranscript(false)} title="Raw transcript">
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.6, maxHeight: '60vh', overflowY: 'auto' }}>
          {session.transcript || <span className="muted">No transcript recorded.</span>}
        </div>
        <Rule />
        <button
          className="btn sm ghost"
          onClick={() => downloadText(`transcript-${session.id}.txt`, session.transcript || '')}
        >
          ⬇ Download
        </button>
      </Modal>
    </>
  );
}

/* ============================================================
   Import an old recording or a pasted transcript
   ============================================================ */

function ImportModal({ open, onClose, onSynthesize }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const fileRef = useRef(null);
  const toast = useToast();

  const finish = (transcript) => {
    const session = actions.addSession({ transcript, startedAt: Date.now(), endedAt: Date.now() });
    setText('');
    onClose();
    onSynthesize(session);
  };

  const fromText = () => {
    if (text.trim().length < 60) {
      toast('That transcript is too short to work with.', 'error');
      return;
    }
    finish(text.trim());
  };

  const fromAudio = async (file) => {
    setBusy(true);
    try {
      // Whisper caps at 25 MB per request, so long recordings get sliced.
      const LIMIT = 24 * 1024 * 1024;
      const st = getState();
      const vocabulary = [st.campaign.name, ...(st.campaign.glossary || []), ...st.characters.map((c) => c.name)]
        .filter(Boolean)
        .join(', ');

      if (file.size <= LIMIT) {
        setProgress('Transcribing…');
        const { text: t } = await api.transcribe(file, { vocabulary });
        finish(t);
        return;
      }

      const parts = Math.ceil(file.size / LIMIT);
      const out = [];
      for (let i = 0; i < parts; i++) {
        setProgress(`Transcribing part ${i + 1} of ${parts}…`);
        const slice = file.slice(i * LIMIT, (i + 1) * LIMIT, file.type);
        const { text: t } = await api.transcribe(slice, { vocabulary });
        out.push(t);
      }
      finish(out.join(' '));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import a session">
      <p style={{ marginTop: 0 }}>
        Drop in an audio file from a session you already recorded, or paste a transcript from
        anywhere — Discord, Craig, a voice memo, or your own typed notes.
      </p>

      <div className="row">
        <button className="btn gold" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <><span className="spinner" /> {progress}</> : '🎙 Choose an audio file'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,video/mp4,video/webm"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && fromAudio(e.target.files[0])}
        />
        <span className="tiny muted">mp3, m4a, wav, webm, ogg — files over 24 MB are split automatically</span>
      </div>

      <Rule />

      <textarea
        rows={9}
        placeholder="…or paste a transcript here."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={fromText} disabled={busy || text.trim().length < 60}>
          Add and write it up
        </button>
      </div>
    </Modal>
  );
}
