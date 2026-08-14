import React, { useState, useMemo } from 'react';
import {
  Panel, Rule, Empty, Tag, Field, Modal, StatBlock, useToast, copyText, downloadText, fmtDate,
} from '../components/ui.jsx';
import { useStore, actions, getState } from '../lib/store.js';
import { api } from '../lib/api.js';

/* ============================================================
   The forge menu
   ============================================================ */

const KINDS = [
  { kind: 'npc',        label: 'NPC',            glyph: '🧙', blurb: 'A person, a voice, a secret, and a stat block' },
  { kind: 'settlement', label: 'Town or City',   glyph: '🏘️', blurb: 'Districts, locations, notables, rumors' },
  { kind: 'quest',      label: 'Side Quest',     glyph: '📜', blurb: 'Hook, beats, twist, rewards' },
  { kind: 'encounter',  label: 'Encounter',      glyph: '⚔️', blurb: 'Balanced fight with terrain and tactics' },
  { kind: 'shop',       label: 'Shop',           glyph: '🪙', blurb: 'Proprietor and priced inventory' },
  { kind: 'tavern',     label: 'Tavern',         glyph: '🍺', blurb: 'Menu, patrons, and tonight’s trouble' },
  { kind: 'item',       label: 'Magic Item',     glyph: '💎', blurb: 'Balanced rules text with a history' },
  { kind: 'dungeon',    label: 'Dungeon',        glyph: '🕯️', blurb: 'Interlocking rooms with boxed text' },
  { kind: 'trap',       label: 'Trap or Hazard', glyph: '☠️', blurb: 'Tell, DCs, effect, escalation' },
  { kind: 'rumors',     label: 'Rumor Table',    glyph: '👂', blurb: 'True, half-true, and false' },
  { kind: 'twist',      label: 'Plot Twists',    glyph: '🌀', blurb: 'Foreshadowable reversals' },
  { kind: 'name',       label: 'Name Bank',      glyph: '✒️', blurb: 'Ten of everything, one culture' },
];

const TONES = [
  'grounded heroic', 'high fantasy', 'grimdark', 'swashbuckling', 'gothic horror',
  'comedic', 'political intrigue', 'weird / cosmic', 'sword & sorcery', 'fairy tale',
];

const BIOMES = [
  'temperate river valley', 'coastal cliffs', 'deep forest', 'high mountains', 'salt marsh',
  'desert waste', 'frozen tundra', 'volcanic badlands', 'rolling farmland', 'underdark cavern',
  'ruined city', 'endless steppe',
];

/** Which inputs each generator shows. */
const FIELDS = {
  npc:        ['role', 'threat', 'level', 'tone', 'setting', 'notes'],
  settlement: ['size', 'biome', 'trait', 'level', 'tone', 'notes'],
  quest:      ['type', 'length', 'partySize', 'level', 'tone', 'setting', 'notes'],
  encounter:  ['difficulty', 'biome', 'theme', 'partySize', 'level', 'notes'],
  shop:       ['type', 'size', 'level', 'tone', 'notes'],
  tavern:     ['quality', 'size', 'tone', 'notes'],
  item:       ['rarity', 'type', 'theme', 'level', 'tone', 'notes'],
  dungeon:    ['theme', 'biome', 'rooms', 'partySize', 'level', 'tone', 'notes'],
  trap:       ['biome', 'difficulty', 'level', 'tone', 'notes'],
  rumors:     ['place', 'count', 'tone', 'setting', 'notes'],
  twist:      ['count', 'level', 'tone', 'setting', 'notes'],
  name:       ['culture', 'notes'],
};

const OPTIONS = {
  size: ['hamlet', 'village', 'town', 'city', 'metropolis'],
  difficulty: ['easy', 'medium', 'hard', 'deadly'],
  rarity: ['common', 'uncommon', 'rare', 'very rare', 'legendary'],
  quality: ['squalid', 'poor', 'modest but clean', 'comfortable', 'wealthy', 'aristocratic'],
  threat: ['harmless', 'minor', 'serious', 'deadly'],
  length: ['one scene', 'one session', 'two or three sessions'],
  tone: TONES,
  biome: BIOMES,
};

const LABELS = {
  role: 'Role in the story', threat: 'Threat level', level: 'Party level', tone: 'Tone',
  setting: 'Setting context', notes: 'Anything else', size: 'Size', biome: 'Biome',
  trait: 'Defining trait', type: 'Type', length: 'Length', partySize: 'Party size',
  difficulty: 'Difficulty', theme: 'Theme', rarity: 'Rarity', quality: 'Quality',
  rooms: 'Rooms', place: 'Where it’s overheard', count: 'How many', culture: 'Cultural flavor',
};

const PLACEHOLDERS = {
  role: 'quest giver, rival, shopkeep, informant…',
  type: 'leave blank for the DM’s choice',
  theme: 'undead, fey, cult, bandits, clockwork…',
  trait: 'built on a bridge, no one sleeps here, run by a guild of thieves…',
  place: 'a busy tavern, the temple steps, the docks at dawn…',
  culture: 'Norse, Arabic, Slavic, Celtic, invented…',
  notes: 'Tie it to something already happening in your campaign.',
};

/* ============================================================
   Tab
   ============================================================ */

export default function Improv() {
  const campaign = useStore((s) => s.campaign);
  const saved = useStore((s) => s.generated);
  const [kind, setKind] = useState('npc');
  const [params, setParams] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [filter, setFilter] = useState('');
  const toast = useToast();

  const fields = FIELDS[kind] || [];

  const roll = async (overrides = {}) => {
    setBusy(true);
    setResult(null);
    try {
      const payload = {
        tone: campaign.tone,
        level: campaign.level,
        setting: campaign.setting,
        partySize: getState().characters.length || 4,
        ...params,
        ...overrides,
      };
      const { data } = await api.generate(kind, payload);
      setResult({ kind, data, params: payload });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return saved;
    return saved.filter((g) => JSON.stringify(g.data).toLowerCase().includes(q));
  }, [saved, filter]);

  return (
    <>
      <Panel dark title="The Improv Forge" sub="Your players just walked somewhere you never prepared. Fine.">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: 9 }}>
          {KINDS.map((k) => (
            <button
              key={k.kind}
              onClick={() => { setKind(k.kind); setResult(null); }}
              style={{
                cursor: 'pointer',
                textAlign: 'left',
                padding: '11px 12px',
                borderRadius: 3,
                font: 'inherit',
                color: kind === k.kind ? '#2a1c04' : 'var(--parchment)',
                border: `1px solid ${kind === k.kind ? 'var(--gold-bright)' : 'rgba(201,162,39,.35)'}`,
                background: kind === k.kind
                  ? 'linear-gradient(180deg, var(--gold-bright), var(--gold))'
                  : 'rgba(0,0,0,.28)',
                boxShadow: kind === k.kind ? '0 0 18px rgba(201,162,39,.3)' : 'none',
                transition: 'all .14s',
              }}
            >
              <div style={{ fontSize: 19, marginBottom: 2 }}>{k.glyph}</div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: 13.5, fontWeight: 600, letterSpacing: '.05em' }}>
                {k.label}
              </div>
              <div style={{ fontSize: 12, opacity: kind === k.kind ? 0.75 : 0.6, lineHeight: 1.3, marginTop: 2 }}>
                {k.blurb}
              </div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title={KINDS.find((k) => k.kind === kind)?.label}>
        <div className="grid three">
          {fields.map((f) => (
            <Field key={f} label={LABELS[f] || f}>
              {OPTIONS[f] ? (
                <select
                  value={params[f] ?? (f === 'tone' ? campaign.tone : '')}
                  onChange={(e) => setParams((p) => ({ ...p, [f]: e.target.value }))}
                >
                  {!['tone'].includes(f) && <option value="">— any —</option>}
                  {OPTIONS[f].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : ['level', 'partySize', 'rooms', 'count'].includes(f) ? (
                <input
                  type="number"
                  min="1"
                  value={
                    params[f] ??
                    (f === 'level' ? campaign.level : f === 'partySize' ? (getState().characters.length || 4) : f === 'rooms' ? 6 : 6)
                  }
                  onChange={(e) => setParams((p) => ({ ...p, [f]: Number(e.target.value) }))}
                />
              ) : f === 'setting' || f === 'notes' ? (
                <textarea
                  rows={2}
                  value={params[f] ?? (f === 'setting' ? campaign.setting : '')}
                  placeholder={PLACEHOLDERS[f]}
                  onChange={(e) => setParams((p) => ({ ...p, [f]: e.target.value }))}
                />
              ) : (
                <input
                  type="text"
                  value={params[f] ?? ''}
                  placeholder={PLACEHOLDERS[f] || ''}
                  onChange={(e) => setParams((p) => ({ ...p, [f]: e.target.value }))}
                />
              )}
            </Field>
          ))}
        </div>

        <Rule />

        <div className="row">
          <button className="btn gold" onClick={() => roll()} disabled={busy}>
            {busy ? <><span className="spinner" /> Forging…</> : '🎲 Generate'}
          </button>
          {result && (
            <>
              <button className="btn ghost sm" onClick={() => roll()} disabled={busy}>↻ Another</button>
              <button
                className="btn moss sm"
                onClick={() => {
                  actions.saveGenerated(result);
                  toast('Saved to the vault.', 'success');
                }}
              >
                ✦ Save
              </button>
              <button
                className="btn ghost sm"
                onClick={() => {
                  copyText(toPlainText(result.kind, result.data));
                  toast('Copied.', 'success');
                }}
              >
                Copy
              </button>
            </>
          )}
          <span className="spacer" />
          <button
            className="btn ghost sm"
            onClick={() => setParams({})}
            disabled={!Object.keys(params).length}
          >
            Reset fields
          </button>
        </div>
      </Panel>

      {busy && (
        <Panel>
          <div className="empty">
            <span className="spinner" style={{ width: 26, height: 26, borderWidth: 3 }} />
            <div style={{ marginTop: 12, fontStyle: 'italic' }}>Consulting the oracle…</div>
          </div>
        </Panel>
      )}

      {result && <Result kind={result.kind} data={result.data} />}

      {/* ---------- vault ---------- */}
      <Panel
        title="The Vault"
        sub={`${saved.length} saved`}
        right={
          saved.length ? (
            <input
              type="text"
              placeholder="Search…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ width: 200, padding: '5px 9px', fontSize: 14 }}
            />
          ) : null
        }
      >
        {filtered.length ? (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 9 }}>
            {filtered.map((g) => {
              const meta = KINDS.find((k) => k.kind === g.kind);
              return (
                <div
                  key={g.id}
                  style={{
                    border: '1px solid rgba(0,0,0,.2)',
                    borderRadius: 3,
                    padding: '10px 12px',
                    background: 'rgba(0,0,0,.05)',
                  }}
                >
                  <div className="row tight">
                    <span>{meta?.glyph}</span>
                    <span className="tiny muted">{meta?.label}</span>
                    <span className="spacer" />
                    <button
                      className="btn xs ghost"
                      onClick={() => actions.removeGenerated(g.id)}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-head)',
                      fontSize: 15,
                      margin: '4px 0 3px',
                      lineHeight: 1.25,
                    }}
                  >
                    {titleOf(g.data)}
                  </div>
                  <div className="tiny muted" style={{ marginBottom: 8 }}>{fmtDate(g.createdAt)}</div>
                  <button className="btn xs" onClick={() => setViewing(g)}>Open</button>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty glyph="🗝️">Nothing saved yet. Generate something and press Save.</Empty>
        )}
      </Panel>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? titleOf(viewing.data) : ''}>
        {viewing && (
          <>
            <div className="row tight" style={{ marginBottom: 12 }}>
              <button
                className="btn xs ghost"
                onClick={() => { copyText(toPlainText(viewing.kind, viewing.data)); toast('Copied.', 'success'); }}
              >
                Copy
              </button>
              <button
                className="btn xs ghost"
                onClick={() =>
                  downloadText(`${titleOf(viewing.data).replace(/[^\w -]/g, '')}.md`, toPlainText(viewing.kind, viewing.data), 'text/markdown')
                }
              >
                ⬇ .md
              </button>
            </div>
            <Result kind={viewing.kind} data={viewing.data} bare />
          </>
        )}
      </Modal>
    </>
  );
}

/* ============================================================
   Rendering generated content
   ============================================================ */

const titleOf = (d) =>
  d?.name || d?.title || d?.twists?.[0]?.twist?.slice(0, 44) || d?.categories?.[0]?.label || 'Untitled';

/** Turn a camelCase key into a heading. */
const humanize = (k) =>
  k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

// Rendered in the header/subheader, so don't repeat them in the body.
const SKIP = new Set([
  'name', 'title', 'statblock', 'oneLine', 'readAloud', 'approach',
  'kind', 'rarity', 'difficulty', 'pronouns', 'population',
]);

function Result({ kind, data, bare }) {
  if (!data) return null;

  const body = (
    <>
      {data.oneLine && (
        <p style={{ fontFamily: 'var(--font-head)', fontSize: 17.5, fontStyle: 'italic', marginTop: 0 }}>
          {data.oneLine}
        </p>
      )}

      {data.readAloud && <ReadAloud text={data.readAloud} />}
      {data.approach && <ReadAloud text={data.approach} label="Arriving" />}
      {data.hook && kind === 'quest' && <ReadAloud text={data.hook} label="The hook" />}

      {Object.entries(data)
        .filter(([k]) => !SKIP.has(k) && !(kind === 'quest' && k === 'hook'))
        .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))
        .map(([k, v]) => (
          <Section key={k} label={humanize(k)} value={v} />
        ))}

      {data.statblock && (
        <>
          <Rule />
          <StatBlock sb={data.statblock} />
        </>
      )}
    </>
  );

  if (bare) return body;

  return (
    <Panel
      title={titleOf(data)}
      sub={[data.kind, data.type, data.rarity, data.difficulty, data.pronouns, data.population && `pop. ${data.population}`]
        .filter(Boolean)
        .join(' · ')}
    >
      {body}
    </Panel>
  );
}

function ReadAloud({ text, label = 'Read aloud' }) {
  return (
    <div
      style={{
        border: '1px solid rgba(109,27,27,.35)',
        borderLeft: '5px solid var(--oxblood)',
        background: 'rgba(255,251,235,.45)',
        borderRadius: 3,
        padding: '13px 16px',
        margin: '0 0 16px',
        fontSize: 16.5,
        lineHeight: 1.62,
        fontStyle: 'italic',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-head)',
          fontSize: 10.5,
          letterSpacing: '.18em',
          textTransform: 'uppercase',
          fontStyle: 'normal',
          opacity: 0.65,
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      {text}
    </div>
  );
}

function Section({ label, value }) {
  // scalar
  if (typeof value !== 'object') {
    return (
      <p style={{ fontSize: 16, margin: '0 0 9px', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--oxblood)' }}>{label}.</strong> {String(value)}
      </p>
    );
  }

  // array of strings
  if (Array.isArray(value) && typeof value[0] !== 'object') {
    return (
      <div style={{ margin: '0 0 14px' }}>
        <Heading>{label}</Heading>
        <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 16, lineHeight: 1.6 }}>
          {value.map((v, i) => <li key={i} style={{ marginBottom: 3 }}>{String(v)}</li>)}
        </ul>
      </div>
    );
  }

  // array of objects
  if (Array.isArray(value)) {
    return (
      <div style={{ margin: '0 0 16px' }}>
        <Heading>{label}</Heading>
        <div className="stack" style={{ gap: 9, marginTop: 6 }}>
          {value.map((row, i) => <Row key={i} row={row} index={i} />)}
        </div>
      </div>
    );
  }

  // plain object
  return (
    <div style={{ margin: '0 0 14px' }}>
      <Heading>{label}</Heading>
      <div style={{ marginTop: 5 }}>
        {Object.entries(value)
          .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))
          .map(([k, v]) => (
            <div key={k} style={{ fontSize: 16, marginBottom: 4, lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--oxblood)' }}>{humanize(k)}.</strong>{' '}
              {Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </div>
          ))}
      </div>
    </div>
  );
}

function Heading({ children }) {
  return (
    <div className="panel-title" style={{ fontSize: 12, marginBottom: 0 }}>
      <span>{children}</span>
      <span className="flourish" />
    </div>
  );
}

function Row({ row, index }) {
  const head = row.name || row.item || row.quest || row.thread || row.twist || row.text || row.event || row.what;
  const num = row.number ?? row.d ?? null;

  return (
    <div
      style={{
        border: '1px solid rgba(0,0,0,.16)',
        borderRadius: 3,
        padding: '9px 12px',
        background: 'rgba(0,0,0,.045)',
      }}
    >
      <div className="row tight" style={{ marginBottom: 3 }}>
        {num != null && (
          <span
            className="mono"
            style={{ color: 'var(--oxblood)', fontWeight: 700, fontSize: 14, minWidth: 18 }}
          >
            {num}
          </span>
        )}
        {head && <strong style={{ fontSize: 16 }}>{head}</strong>}
        {row.count > 1 && <Tag>×{row.count}</Tag>}
        {row.cr && <Tag tone="blood">CR {row.cr}</Tag>}
        {row.price && <Tag tone="gold">{row.price}</Tag>}
        {row.truth && <Tag tone={row.truth === 'true' ? 'moss' : row.truth === 'false' ? 'blood' : 'gold'}>{row.truth}</Tag>}
        {row.status && <Tag tone={row.status === 'hot' ? 'blood' : 'gold'}>{row.status}</Tag>}
        {row.vibe && <span className="tiny muted">{row.vibe}</span>}
      </div>

      {row.readAloud && (
        <div style={{ fontStyle: 'italic', fontSize: 15.5, borderLeft: '3px solid var(--oxblood)', paddingLeft: 10, margin: '6px 0' }}>
          {row.readAloud}
        </div>
      )}

      {Object.entries(row)
        .filter(([k, v]) =>
          !['name', 'item', 'quest', 'thread', 'twist', 'text', 'event', 'what', 'number', 'd',
            'count', 'cr', 'price', 'truth', 'status', 'vibe', 'readAloud'].includes(k) &&
          v != null && v !== '' && !(Array.isArray(v) && !v.length)
        )
        .map(([k, v]) => (
          <div key={k} style={{ fontSize: 15, lineHeight: 1.55, marginBottom: 2 }}>
            {['desc', 'description'].includes(k) ? (
              String(v)
            ) : (
              <>
                <strong style={{ opacity: 0.75 }}>{humanize(k)}:</strong>{' '}
                {Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </>
            )}
          </div>
        ))}
    </div>
  );
}

/* ---------- plain-text export ---------- */

function toPlainText(kind, data, depth = 0) {
  const pad = '  '.repeat(depth);
  const lines = [];
  if (depth === 0) lines.push(`# ${titleOf(data)}`, '');

  for (const [k, v] of Object.entries(data)) {
    if (depth === 0 && (k === 'name' || k === 'title')) continue;
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;

    if (typeof v !== 'object') {
      lines.push(`${pad}**${humanize(k)}:** ${v}`);
    } else if (Array.isArray(v) && typeof v[0] !== 'object') {
      lines.push(`${pad}**${humanize(k)}:**`, ...v.map((x) => `${pad}- ${x}`));
    } else if (Array.isArray(v)) {
      lines.push(`${pad}**${humanize(k)}:**`);
      v.forEach((row) => {
        lines.push(`${pad}- ${row.name || row.item || row.text || row.twist || ''}`);
        lines.push(toPlainText(kind, row, depth + 1));
      });
    } else {
      lines.push(`${pad}**${humanize(k)}:**`, toPlainText(kind, v, depth + 1));
    }
    if (depth === 0) lines.push('');
  }
  return lines.join('\n');
}
