import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

/* ============================================================
   Toasts
   ============================================================ */

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((message, kind = 'info', ms = 4200) => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, message, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), ms);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-rail">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'err' : t.kind === 'success' ? 'ok' : ''}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ============================================================
   Layout atoms
   ============================================================ */

export function Panel({ title, sub, right, dark, children, className = '', ...rest }) {
  return (
    <section className={`panel ${dark ? 'dark' : ''} ${className}`} {...rest}>
      {(title || right) && (
        <div className="panel-title">
          {title && <span>{title}</span>}
          <span className="flourish" />
          {right}
        </div>
      )}
      {sub && <p className="panel-sub">{sub}</p>}
      {children}
    </section>
  );
}

export function Rule() {
  return <div className="rule" />;
}

export function Empty({ glyph = '🕯️', children }) {
  return (
    <div className="empty">
      <span className="big">{glyph}</span>
      {children}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Spinner() {
  return <span className="spinner" />;
}

export function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="panel modal">
        <div className="panel-title">
          <span>{title}</span>
          <span className="flourish" />
          <button className="btn xs ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
        {footer && (
          <>
            <Rule />
            <div className="row">{footer}</div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Domain atoms
   ============================================================ */

export const MOD = (score) => Math.floor((Number(score || 10) - 10) / 2);
export const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);

export function HpBar({ current = 0, max = 1, temp = 0, height = 12 }) {
  const pct = Math.max(0, Math.min(100, (current / Math.max(1, max)) * 100));
  const tempPct = Math.max(0, Math.min(100 - pct, (temp / Math.max(1, max)) * 100));
  const color =
    current <= 0 ? 'var(--hp-down)' : pct <= 25 ? 'var(--hp-bad)' : pct <= 55 ? 'var(--hp-hurt)' : 'var(--hp-full)';

  return (
    <div
      style={{
        height,
        background: 'rgba(0,0,0,.42)',
        border: '1px solid rgba(0,0,0,.5)',
        borderRadius: 2,
        overflow: 'hidden',
        display: 'flex',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,.6)',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          background: `linear-gradient(180deg, ${color}, rgba(0,0,0,.35)), ${color}`,
          transition: 'width .35s ease',
        }}
      />
      {tempPct > 0 && (
        <div
          style={{
            width: `${tempPct}%`,
            background: 'repeating-linear-gradient(45deg, #6fa8c9, #6fa8c9 4px, #4d7f9c 4px, #4d7f9c 8px)',
            transition: 'width .35s ease',
          }}
        />
      )}
    </div>
  );
}

export function Tag({ children, tone = 'gold' }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

export function Stat({ label, value }) {
  return (
    <div
      style={{
        textAlign: 'center',
        border: '1px solid rgba(0,0,0,.28)',
        borderRadius: 3,
        padding: '6px 4px',
        background: 'rgba(0,0,0,.06)',
        minWidth: 58,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-head)',
          fontSize: 10,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          opacity: 0.7,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

/** The classic six, with modifiers. */
export function AbilityRow({ abilities = {}, compact }) {
  const keys = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  return (
    <div className="row tight" style={{ flexWrap: 'nowrap', gap: 6 }}>
      {keys.map((k) => {
        const v = abilities[k];
        return (
          <div
            key={k}
            style={{
              flex: 1,
              textAlign: 'center',
              border: '1px solid rgba(0,0,0,.25)',
              borderRadius: 3,
              padding: compact ? '3px 2px' : '6px 3px',
              background: 'rgba(0,0,0,.06)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-head)',
                fontSize: 9.5,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                opacity: 0.66,
              }}
            >
              {k}
            </div>
            <div style={{ fontSize: compact ? 15 : 17, fontWeight: 600, lineHeight: 1.15 }}>
              {v ?? '—'}
            </div>
            {v != null && (
              <div style={{ fontSize: 11.5, opacity: 0.75 }}>{fmtMod(MOD(v))}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   A full 5e stat block, rendered the way the books do it
   ============================================================ */

export function StatBlock({ sb }) {
  if (!sb) return null;
  const bar = {
    height: 3,
    background: 'linear-gradient(90deg, var(--oxblood), rgba(109,27,27,.25))',
    margin: '8px 0',
    borderRadius: 2,
  };
  const line = (label, value) =>
    value ? (
      <div style={{ fontSize: 15, marginBottom: 2 }}>
        <strong style={{ color: 'var(--oxblood)' }}>{label}</strong> {value}
      </div>
    ) : null;

  return (
    <div
      style={{
        background: 'rgba(255,251,235,.5)',
        border: '1px solid rgba(109,27,27,.32)',
        borderTop: '4px solid var(--oxblood)',
        borderRadius: 3,
        padding: '14px 16px',
        color: 'var(--ink)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, color: 'var(--oxblood)', lineHeight: 1.15 }}>
        {sb.name}
      </div>
      <div style={{ fontStyle: 'italic', fontSize: 14, opacity: 0.8 }}>
        {[sb.size, sb.type, sb.alignment].filter(Boolean).join(' ')}
      </div>
      <div style={bar} />
      {line('Armor Class', `${sb.ac}${sb.acNote ? ` (${sb.acNote})` : ''}`)}
      {line('Hit Points', `${sb.hp}${sb.hitDice ? ` (${sb.hitDice})` : ''}`)}
      {line('Speed', sb.speed)}
      <div style={bar} />
      <AbilityRow abilities={sb.abilities || {}} compact />
      <div style={bar} />
      {line('Saving Throws', sb.saves)}
      {line('Skills', sb.skills)}
      {line('Senses', sb.senses)}
      {line('Languages', sb.languages)}
      {line('Challenge', `${sb.cr}${sb.xp ? ` (${sb.xp} XP)` : ''}`)}
      {!!(sb.traits || []).length && (
        <>
          <div style={bar} />
          {sb.traits.map((t, i) => (
            <p key={i} style={{ fontSize: 15, margin: '0 0 7px' }}>
              <strong style={{ fontStyle: 'italic' }}>{t.name}.</strong> {t.desc}
            </p>
          ))}
        </>
      )}
      {['actions', 'reactions'].map((key) =>
        (sb[key] || []).length ? (
          <div key={key}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 17,
                color: 'var(--oxblood)',
                borderBottom: '1px solid var(--oxblood)',
                margin: '12px 0 8px',
                textTransform: 'capitalize',
              }}
            >
              {key}
            </div>
            {sb[key].map((a, i) => (
              <p key={i} style={{ fontSize: 15, margin: '0 0 7px' }}>
                <strong style={{ fontStyle: 'italic' }}>{a.name}.</strong> {a.desc}
              </p>
            ))}
          </div>
        ) : null
      )}
    </div>
  );
}

/* ============================================================
   Misc helpers
   ============================================================ */

export function copyText(text) {
  navigator.clipboard?.writeText(text);
}

export function downloadText(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtDuration(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

export function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
