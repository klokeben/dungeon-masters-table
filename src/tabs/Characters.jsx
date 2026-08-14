import React, { useRef, useState } from 'react';
import {
  Panel, Rule, Empty, Tag, Modal, Field, HpBar, AbilityRow, Stat, MOD, fmtMod, useToast,
} from '../components/ui.jsx';
import { useStore, actions } from '../lib/store.js';
import { api } from '../lib/api.js';

export default function Characters() {
  const characters = useStore((s) => s.characters);
  const [uploading, setUploading] = useState([]); // [{name, status}]
  const [openId, setOpenId] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const toast = useToast();

  const ingest = async (files) => {
    const list = Array.from(files);
    setUploading(list.map((f) => ({ name: f.name, status: 'reading' })));

    for (const file of list) {
      try {
        const sheet = await api.parseSheet({ file });
        const c = actions.addCharacter(sheet);
        setUploading((u) => u.map((x) => (x.name === file.name ? { ...x, status: 'done' } : x)));
        toast(`${c.name || file.name} has joined the party.`, 'success');
        if (sheet.parseWarnings?.length) {
          toast(`${c.name}: ${sheet.parseWarnings.slice(0, 2).join('; ')}`, 'info', 7000);
        }
      } catch (e) {
        setUploading((u) => u.map((x) => (x.name === file.name ? { ...x, status: 'failed', error: e.message } : x)));
        toast(`${file.name}: ${e.message}`, 'error');
      }
    }
    setTimeout(() => setUploading([]), 2500);
  };

  const open = characters.find((c) => c.id === openId);

  return (
    <>
      <Panel
        dark
        title="The Party"
        sub="Upload the sheets once. Hit points, AC, and everything else follow you into the live session."
        right={
          <div className="row tight">
            <button className="btn sm ghost" onClick={() => setPasteOpen(true)}>✎ Describe one</button>
            <button className="btn sm gold" onClick={() => fileRef.current?.click()}>＋ Upload sheets</button>
          </div>
        }
      >
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.length) ingest(e.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--gold-bright)' : 'var(--gold-dim)'}`,
            borderRadius: 4,
            padding: '26px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'rgba(201,162,39,.12)' : 'rgba(0,0,0,.16)',
            transition: 'all .16s',
          }}
        >
          <div style={{ fontSize: 30, opacity: 0.55 }}>📜</div>
          <div style={{ fontFamily: 'var(--font-head)', letterSpacing: '.1em', textTransform: 'uppercase', fontSize: 13, marginTop: 6 }}>
            Drop character sheets here
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            PDF, photo of a handwritten sheet, D&D Beyond export, or plain text — several at once is fine
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.txt,.json,.csv,.md,image/*"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.length && ingest(e.target.files)}
        />

        {!!uploading.length && (
          <>
            <Rule />
            <div className="stack" style={{ gap: 6 }}>
              {uploading.map((u) => (
                <div key={u.name} className="row tight tiny">
                  {u.status === 'reading' ? <span className="spinner" /> : u.status === 'done' ? '✓' : '✕'}
                  <span>{u.name}</span>
                  <span className="muted">
                    {u.status === 'reading' ? 'reading the sheet…' : u.status === 'done' ? 'added' : u.error}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      {characters.length ? (
        <div className="grid two">
          {characters.map((c) => (
            <CharacterCard key={c.id} c={c} onOpen={() => setOpenId(c.id)} />
          ))}
        </div>
      ) : (
        <Empty glyph="🛡️">No one at the table yet.</Empty>
      )}

      <Modal open={!!open} onClose={() => setOpenId(null)} title={open?.name || ''}>
        {open && <FullSheet c={open} onClose={() => setOpenId(null)} />}
      </Modal>

      <PasteCharacter open={pasteOpen} onClose={() => setPasteOpen(false)} />
    </>
  );
}

/* ============================================================
   Roster card
   ============================================================ */

function CharacterCard({ c, onOpen }) {
  const hp = c.hp || { current: 0, max: 0, temp: 0 };
  return (
    <Panel>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 23, lineHeight: 1.1, color: 'var(--oxblood)' }}>
            {c.name || 'Unnamed'}
          </div>
          <div className="tiny muted">
            {[c.race, c.subclass ? `${c.class} (${c.subclass})` : c.class, c.level && `level ${c.level}`]
              .filter(Boolean)
              .join(' · ')}
            {c.player ? ` — played by ${c.player}` : ''}
          </div>
        </div>
        <button className="btn xs ghost" onClick={onOpen}>Full sheet</button>
      </div>

      <div className="row" style={{ margin: '13px 0 6px', alignItems: 'baseline' }}>
        <span style={{ fontSize: 22, fontWeight: 600 }}>{hp.current}</span>
        <span className="muted">/ {hp.max} hp</span>
        {hp.temp > 0 && <Tag tone="arcane">+{hp.temp}</Tag>}
        <span className="spacer" />
        <Stat label="AC" value={c.ac ?? '—'} />
        <Stat label="Init" value={c.initiative != null ? fmtMod(c.initiative) : fmtMod(MOD(c.abilities?.dex))} />
        <Stat label="Pass" value={c.passivePerception ?? '—'} />
      </div>

      <HpBar current={hp.current} max={hp.max} temp={hp.temp} />

      <div style={{ marginTop: 13 }}>
        <AbilityRow abilities={c.abilities || {}} />
      </div>

      {!!(c.attacks || []).length && (
        <>
          <Rule />
          <div className="stack" style={{ gap: 3 }}>
            {c.attacks.slice(0, 4).map((a, i) => (
              <div key={i} className="row tight" style={{ fontSize: 14.5 }}>
                <span>⚔</span>
                <strong>{a.name}</strong>
                <span className="muted">{a.bonus}</span>
                <span className="spacer" />
                <span>{a.damage}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {!!(c.conditions || []).length && (
        <div className="row tight" style={{ marginTop: 10 }}>
          {c.conditions.map((cd) => <Tag key={cd} tone="blood">{cd}</Tag>)}
        </div>
      )}
    </Panel>
  );
}

/* ============================================================
   Full sheet
   ============================================================ */

function FullSheet({ c, onClose }) {
  const [tab, setTab] = useState('stats');
  const hp = c.hp || { current: 0, max: 0, temp: 0 };
  const sp = c.spellcasting;

  const sub = (key, label) => (
    <button
      className={`btn xs ${tab === key ? 'gold' : 'ghost'}`}
      onClick={() => setTab(key)}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="row tight" style={{ marginBottom: 14 }}>
        {sub('stats', 'Statistics')}
        {sub('actions', 'Actions')}
        {sp?.spells?.length ? sub('spells', 'Spells') : null}
        {sub('gear', 'Gear')}
        {sub('story', 'Story')}
      </div>

      {tab === 'stats' && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <Stat label="AC" value={c.ac ?? '—'} />
            <Stat label="Speed" value={c.speed || '—'} />
            <Stat label="Prof" value={c.proficiencyBonus != null ? fmtMod(c.proficiencyBonus) : '—'} />
            <Stat label="Hit Dice" value={c.hitDice?.remaining || c.hitDice?.total || '—'} />
            <Stat label="Passive" value={c.passivePerception ?? '—'} />
          </div>

          <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <HpBar current={hp.current} max={hp.max} temp={hp.temp} height={16} />
            </div>
            <input
              type="number"
              value={hp.current}
              onChange={(e) =>
                actions.updateCharacter(c.id, (x) => ({ hp: { ...x.hp, current: Number(e.target.value) } }))
              }
              style={{ width: 70, textAlign: 'center' }}
            />
            <span className="muted">/</span>
            <input
              type="number"
              value={hp.max}
              onChange={(e) =>
                actions.updateCharacter(c.id, (x) => ({ hp: { ...x.hp, max: Number(e.target.value) } }))
              }
              style={{ width: 70, textAlign: 'center' }}
            />
          </div>

          <Rule />
          <AbilityRow abilities={c.abilities || {}} />

          {!!(c.skills || []).length && (
            <>
              <Rule />
              <div className="panel-title" style={{ fontSize: 12 }}><span>Skills</span><span className="flourish" /></div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 2 }}>
                {c.skills.map((s, i) => (
                  <div key={i} className="row tight" style={{ fontSize: 14.5 }}>
                    <span style={{ opacity: s.prof === 'none' ? 0.25 : 1 }}>
                      {s.prof === 'expertise' ? '◆' : '●'}
                    </span>
                    <span>{s.name}</span>
                    <span className="spacer" />
                    <strong>{fmtMod(s.mod ?? 0)}</strong>
                  </div>
                ))}
              </div>
            </>
          )}

          {!!(c.features || []).length && (
            <>
              <Rule />
              <div className="panel-title" style={{ fontSize: 12 }}><span>Features & Traits</span><span className="flourish" /></div>
              {c.features.map((f, i) => (
                <p key={i} style={{ fontSize: 15, margin: '0 0 8px' }}>
                  <strong>{f.name}.</strong> {f.desc}
                </p>
              ))}
            </>
          )}
        </>
      )}

      {tab === 'actions' && (
        <>
          {(c.attacks || []).length ? (
            c.attacks.map((a, i) => (
              <div key={i} className="row" style={{ padding: '7px 0', borderBottom: '1px solid rgba(0,0,0,.1)' }}>
                <strong style={{ fontSize: 16 }}>{a.name}</strong>
                <Tag>{a.bonus}</Tag>
                <span className="spacer" />
                <span>{a.damage}</span>
                {a.notes && <span className="tiny muted">{a.notes}</span>}
              </div>
            ))
          ) : (
            <Empty glyph="⚔️">No attacks recorded on this sheet.</Empty>
          )}
          {!!(c.proficiencies) && (
            <>
              <Rule />
              <p className="tiny"><strong>Proficiencies.</strong> {c.proficiencies}</p>
            </>
          )}
        </>
      )}

      {tab === 'spells' && sp && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <Stat label="Ability" value={sp.ability || '—'} />
            <Stat label="Save DC" value={sp.saveDc ?? '—'} />
            <Stat label="Attack" value={sp.attackBonus || '—'} />
          </div>
          {!!sp.slots && (
            <div className="row tight" style={{ marginBottom: 12 }}>
              {Object.entries(sp.slots)
                .filter(([, v]) => v > 0)
                .map(([lvl, v]) => <Tag key={lvl}>Lv {lvl}: {v}</Tag>)}
            </div>
          )}
          {Array.from(new Set((sp.spells || []).map((s) => s.level)))
            .sort((a, b) => a - b)
            .map((lvl) => (
              <div key={lvl} style={{ marginBottom: 12 }}>
                <div className="panel-title" style={{ fontSize: 12 }}>
                  <span>{lvl === 0 ? 'Cantrips' : `Level ${lvl}`}</span>
                  <span className="flourish" />
                </div>
                <div className="row tight">
                  {sp.spells
                    .filter((s) => s.level === lvl)
                    .map((s, i) => (
                      <Tag key={i} tone={s.prepared ? 'arcane' : 'gold'}>{s.name}</Tag>
                    ))}
                </div>
              </div>
            ))}
        </>
      )}

      {tab === 'gear' && (
        <>
          <div className="row tight" style={{ marginBottom: 12 }}>
            {Object.entries(c.currency || {})
              .filter(([, v]) => v)
              .map(([k, v]) => <Tag key={k} tone="gold">{v} {k}</Tag>)}
          </div>
          {(c.equipment || []).length ? (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {c.equipment.map((e, i) => <li key={i} style={{ marginBottom: 3 }}>{e}</li>)}
            </ul>
          ) : (
            <Empty glyph="🎒">Nothing recorded.</Empty>
          )}
        </>
      )}

      {tab === 'story' && (
        <>
          <div className="grid two" style={{ gap: 10 }}>
            {['traits', 'ideals', 'bonds', 'flaws'].map((k) =>
              c.personality?.[k] ? (
                <div key={k}>
                  <div className="tiny muted" style={{ letterSpacing: '.14em', textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ fontSize: 15 }}>{c.personality[k]}</div>
                </div>
              ) : null
            )}
          </div>
          {c.backstory && (
            <>
              <Rule />
              <p style={{ fontSize: 16, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{c.backstory}</p>
            </>
          )}
          <Rule />
          <Field label="DM notes on this character — private">
            <textarea
              rows={4}
              value={c.dmNotes || ''}
              onChange={(e) => actions.updateCharacter(c.id, { dmNotes: e.target.value })}
              placeholder="What they don't know yet. What their bond is going to cost them."
            />
          </Field>
        </>
      )}

      {!!(c.parseWarnings || []).length && (
        <>
          <Rule />
          <p className="tiny" style={{ color: 'var(--oxblood)' }}>
            <strong>When reading this sheet:</strong> {c.parseWarnings.join(' · ')}
          </p>
        </>
      )}

      <Rule />
      <div className="row">
        <button
          className="btn sm blood"
          onClick={() => {
            if (confirm(`Remove ${c.name} from the party?`)) {
              actions.removeCharacter(c.id);
              onClose();
            }
          }}
        >
          Remove from party
        </button>
      </div>
    </>
  );
}

/* ============================================================
   Describe a character in prose
   ============================================================ */

function PasteCharacter({ open, onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const go = async () => {
    if (text.trim().length < 20) return;
    setBusy(true);
    try {
      const sheet = await api.parseSheet({ text });
      const c = actions.addCharacter(sheet);
      toast(`${c.name} has joined the party.`, 'success');
      setText('');
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Describe a character">
      <p style={{ marginTop: 0 }}>
        Paste anything — a D&D Beyond text export, a wall of stats, or just a description.
        Whatever isn't there is left blank for you to fill in.
      </p>
      <textarea
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Brann Hollowmere, level 4 dwarf cleric of the Forge, played by Sam. AC 18, 34 hp, STR 14 DEX 10 CON 16 INT 11 WIS 17 CHA 9…'}
      />
      <Rule />
      <button className="btn gold" onClick={go} disabled={busy || text.trim().length < 20}>
        {busy ? <><span className="spinner" /> Reading…</> : 'Add to party'}
      </button>
    </Modal>
  );
}
