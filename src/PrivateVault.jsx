/**
 * PrivateVault.jsx — TIMEVAULT Private Vault page
 *
 * Usage (unchanged from the existing integration):
 *   import PrivateVault from './PrivateVault';
 *   <PrivateVault onClose={() => ...return to the store...} />
 *
 * Access flow (state machine, `stage`):
 *   card -> checking -> verified -> opening -> pin -> pinChecking -> granted -> dashboard
 *                 \-> card (error)                 \-> pin (error)
 *   pin -> closing -> card   ("Use a different card")
 *
 * SECURITY NOTE: this is a FRONT-END DEMONSTRATION. The demo card number and PIN below
 * live in the browser bundle and are NOT real authentication. All checking goes through
 * `verifyCardNumber` / `verifyPin` (the "auth adapter"); replace those two functions with
 * calls to a real server that authenticates, rate-limits and issues a session. Never store
 * real PINs or credentials in localStorage.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import VaultBox3D from './VaultBox3D';
import './PrivateVault.css';

/* ========================================================================== */
/* Auth adapter (DEMO ONLY — swap for server calls)                            */
/* ========================================================================== */
const DEMO_ONLY = Object.freeze({ cardNumber: 'TV-2026-001', pin: '2580' });
const CARD_PATTERN = /^TV-\d{4}-\d{3}$/;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function verifyCardNumber(cardNumber) {
  // Production: POST the card number to your server, never compare client-side.
  await wait(850);
  if (cardNumber === DEMO_ONLY.cardNumber) {
    return { ok: true, collectorNumber: cardNumber };
  }
  return {
    ok: false,
    message: 'We couldn’t find that card number. Please check it and try again.',
  };
}

async function verifyPin(cardNumber, pin) {
  // Production: POST card + PIN to your server; the server enforces attempt limits.
  await wait(650);
  return { ok: cardNumber === DEMO_ONLY.cardNumber && pin === DEMO_ONLY.pin };
}

const normalizeCard = (value) => value.trim().toUpperCase().replace(/\s+/g, '');
const OPEN_STAGES = ['opening', 'pin', 'pinChecking', 'granted'];

/* ========================================================================== */
/* Icons                                                                       */
/* ========================================================================== */
function CardIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 36 26" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="33" height="23" rx="3" stroke="currentColor" strokeWidth="2" />
      <rect x="1.5" y="7" width="33" height="4.5" fill="currentColor" opacity="0.8" />
      <rect x="6" y="17" width="10" height="3" rx="1" fill="currentColor" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="2.5" />
      <path d="M14 25l7 7 14-15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BackspaceIcon() {
  return (
    <svg viewBox="0 0 32 24" width="34" height="26" fill="none" aria-hidden="true">
      <path d="M10 3h18a2 2 0 012 2v14a2 2 0 01-2 2H10L2 12 10 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 9l7 7M23 9l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Brand() {
  return (
    <span className="tv-vault-brand">
      <span className="tv-vault-brand-mark" aria-hidden="true">T</span>
      <span className="tv-vault-brand-word">TIMEVAULT</span>
    </span>
  );
}

/* ========================================================================== */
/* Screen content (rendered ON the 3D displays; sized by VaultBox3D)           */
/* Top display design size: 760 x 520.  Inner display: 640 x 800.              */
/* ========================================================================== */
function Lockup({ small = false }) {
  return (
    <div
      className={`tv-vault-lockup${small ? ' tv-vault-lockup-small' : ''}`}
      role="img"
      aria-label="TIMEVAULT PRIVATE ACCESS"
    >
      <div className="tv-vault-lockup-row" aria-hidden="true">
        <span className="tv-vault-monogram">T</span>
        <span className="tv-vault-wordmark">TIMEVAULT</span>
      </div>
      <span className="tv-vault-lockup-sub" aria-hidden="true">PRIVATE ACCESS</span>
    </div>
  );
}

function StatusScreen({ kind, title, detail }) {
  return (
    <div className="tv-vault-screen tv-vault-screen-status" role="status" aria-live="polite">
      <Lockup />
      {kind === 'success' ? (
        <CheckIcon className="tv-vault-status-icon" />
      ) : (
        <span className="tv-vault-spinner" aria-hidden="true" />
      )}
      <p className="tv-vault-status-title">{title}</p>
      {detail ? <p className="tv-vault-status-detail">{detail}</p> : null}
    </div>
  );
}

function CardScreen({ stage, value, error, onChange, onSubmit }) {
  if (stage === 'verified') {
    return <StatusScreen kind="success" title="CARD VERIFIED" detail="Preparing your vault…" />;
  }
  if (stage === 'opening') {
    return <StatusScreen kind="busy" title="OPENING THE BOX" detail="" />;
  }
  if (stage === 'pin' || stage === 'pinChecking' || stage === 'granted') {
    return <StatusScreen kind="success" title="BOX OPEN" detail="Continue with your PIN." />;
  }
  if (stage === 'closing') {
    return <StatusScreen kind="busy" title="SECURING THE BOX" detail="" />;
  }

  const checking = stage === 'checking';
  return (
    <form className="tv-vault-screen" onSubmit={onSubmit} noValidate aria-busy={checking}>
      <Lockup />
      <h2 className="tv-vault-screen-title">IDENTIFY YOUR COLLECTION</h2>
      <div className="tv-vault-field">
        <CardIcon className="tv-vault-field-icon" />
        <input
          className="tv-vault-input"
          name="tv-special-card"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter your Special Card Number"
          aria-label="Special Card Number"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'tv-vault-card-error' : undefined}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          readOnly={checking}
        />
      </div>
      <button className="tv-vault-btn-gold" type="submit" disabled={checking}>
        {checking ? 'VERIFYING…' : 'UNLOCK THE BOX'}
      </button>
      <p
        className="tv-vault-msg tv-vault-msg-error"
        id="tv-vault-card-error"
        role={error ? 'alert' : undefined}
      >
        {error}
      </p>
    </form>
  );
}

const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const keepFocus = (e) => e.preventDefault();

function PinScreen({
  stage,
  value,
  error,
  shakeKey,
  focusToken,
  onChange,
  onDigit,
  onBackspace,
  onClear,
  onSubmit,
  onCancel,
}) {
  const inputRef = useRef(null);
  const busy = stage === 'pinChecking';

  useEffect(() => {
    if (stage === 'pin' && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
    }
  }, [stage, focusToken]);

  if (stage === 'granted') {
    return <StatusScreen kind="success" title="ACCESS GRANTED" detail="Opening your private vault…" />;
  }
  if (stage !== 'pin' && stage !== 'pinChecking') {
    return <StatusScreen kind="busy" title="TIMEVAULT" detail="" />;
  }

  return (
    <form className="tv-vault-screen tv-vault-screen-pin" onSubmit={onSubmit} noValidate aria-busy={busy}>
      <Lockup small />
      <h2 className="tv-vault-screen-title">ENTER YOUR PIN</h2>
      <p className="tv-vault-screen-hint">Four digits · entry is masked</p>

      <div
        className="tv-vault-pin"
        onClick={() => inputRef.current && inputRef.current.focus({ preventScroll: true })}
      >
        <div className={`tv-vault-pin-slots${error ? ' tv-vault-shake' : ''}`} key={shakeKey}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="tv-vault-pin-slot"
              data-filled={i < value.length}
              data-active={i === Math.min(value.length, 3)}
            >
              {i < value.length ? '●' : ''}
            </span>
          ))}
        </div>
        <input
          ref={inputRef}
          className="tv-vault-pin-input"
          name="tv-demo-pin"
          type="password"
          inputMode="none"
          pattern="[0-9]*"
          maxLength={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          aria-label="Four-digit PIN"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'tv-vault-pin-error' : undefined}
          disabled={busy}
        />
      </div>

      <p
        className="tv-vault-msg tv-vault-msg-error"
        id="tv-vault-pin-error"
        role={error ? 'alert' : undefined}
      >
        {error}
      </p>

      <div className="tv-vault-keypad" role="group" aria-label="PIN keypad">
        {KEYPAD_DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            className="tv-vault-key"
            onMouseDown={keepFocus}
            onClick={() => onDigit(d)}
            disabled={busy}
          >
            {d}
          </button>
        ))}
        <button type="button" className="tv-vault-key tv-vault-key-small" onMouseDown={keepFocus} onClick={onClear} disabled={busy}>
          CLEAR
        </button>
        <button type="button" className="tv-vault-key" onMouseDown={keepFocus} onClick={() => onDigit('0')} disabled={busy}>
          0
        </button>
        <button type="button" className="tv-vault-key tv-vault-key-small" onMouseDown={keepFocus} onClick={onBackspace} disabled={busy} aria-label="Delete last digit">
          <BackspaceIcon />
        </button>
      </div>

      <button className="tv-vault-btn-gold tv-vault-btn-pin" type="submit" disabled={busy}>
        {busy ? 'CHECKING…' : 'UNLOCK THE VAULT'}
      </button>
      <button type="button" className="tv-vault-link" onClick={onCancel} disabled={busy}>
        Use a different card
      </button>
    </form>
  );
}

/* Flat fallback used only if WebGL / the 3D scene cannot start */
function ScaledPanel({ designWidth, designHeight, children }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => setScale(Math.min(1, el.clientWidth / designWidth));
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designWidth]);

  return (
    <div
      ref={wrapRef}
      className="tv-vault-scaled"
      style={{ maxWidth: designWidth, height: designHeight * scale }}
    >
      <div
        className="tv-vault-scaled-inner"
        style={{
          width: designWidth,
          height: designHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Dashboard (sample data is clearly labelled as demonstration data)           */
/* ========================================================================== */
const SAMPLE_WATCHES = [
  {
    id: 1,
    brand: 'Aurelian',
    model: 'Meridian Date',
    reference: 'AM-3820',
    year: 2019,
    purchased: '2022-09-09',
    warrantyUntil: '2027-09-09',
    dial: '#0f4a37',
    ring: '#d7bd83',
    strap: '#2b2a26',
    note: 'The first automatic in the collection.',
  },
  {
    id: 2,
    brand: 'Calder & Voss',
    model: 'Slim Dress 36',
    reference: 'CV-3601',
    year: 2016,
    purchased: '2018-12-15',
    warrantyUntil: '2023-12-15',
    dial: '#efe6cf',
    ring: '#b8923f',
    strap: '#5a3b26',
    note: 'A gift to mark a milestone birthday.',
  },
  {
    id: 3,
    brand: 'Orsini',
    model: 'Nautilo Diver',
    reference: 'OR-D300',
    year: 2021,
    purchased: '2023-05-20',
    warrantyUntil: '2028-05-20',
    dial: '#14233a',
    ring: '#c9ccd2',
    strap: '#1a1a1a',
    note: 'Worn on every holiday since.',
  },
];

const SAMPLE_STORIES = [
  {
    id: 1,
    watchId: 1,
    title: 'The day it arrived',
    date: '2022-09-09',
    text: 'Unboxed at the kitchen table with the whole family watching. The second hand’s sweep was the first thing I noticed.',
  },
  {
    id: 2,
    watchId: 2,
    title: 'A quiet gift',
    date: '2018-12-15',
    text: 'Handed over with a handwritten note. It has been to every important dinner since.',
  },
  {
    id: 3,
    watchId: 3,
    title: 'First dive',
    date: '2023-06-02',
    text: 'Took it down to twelve metres off the coast. It kept perfect time and came back covered in salt.',
  },
];

const DIAL_PALETTE = [
  { dial: '#0f4a37', ring: '#d7bd83', strap: '#2b2a26' },
  { dial: '#efe6cf', ring: '#b8923f', strap: '#5a3b26' },
  { dial: '#14233a', ring: '#c9ccd2', strap: '#1a1a1a' },
  { dial: '#3b1f1f', ring: '#d7bd83', strap: '#23201c' },
];

const TABS = [
  { id: 'vault', label: 'My Vault' },
  { id: 'pieces', label: 'My Timepieces' },
  { id: 'stories', label: 'Stories & Memories' },
  { id: 'archive', label: 'Ownership Archive' },
  { id: 'profile', label: 'Collector Profile' },
];

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function warrantyLabel(iso) {
  if (!iso) return 'Not recorded';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'Not recorded';
  return d.getTime() < Date.now() ? `Expired ${formatDate(iso)}` : `Active until ${formatDate(iso)}`;
}

function WatchGlyph({ dial, ring, strap }) {
  const ticks = Array.from({ length: 12 }, (_, i) => i);
  return (
    <svg className="tv-vault-glyph" viewBox="0 0 120 120" role="img" aria-label="Watch illustration">
      <rect x="44" y="0" width="32" height="26" rx="4" fill={strap} />
      <rect x="44" y="94" width="32" height="26" rx="4" fill={strap} />
      <circle cx="60" cy="60" r="38" fill={ring} />
      <circle cx="60" cy="60" r="33" fill={dial} />
      {ticks.map((i) => (
        <line
          key={i}
          x1="60"
          y1="30"
          x2="60"
          y2={i % 3 === 0 ? 38 : 35}
          stroke={ring}
          strokeWidth={i % 3 === 0 ? 2.4 : 1.4}
          transform={`rotate(${i * 30} 60 60)`}
        />
      ))}
      <line x1="60" y1="60" x2="60" y2="40" stroke={ring} strokeWidth="2.4" strokeLinecap="round" transform="rotate(-35 60 60)" />
      <line x1="60" y1="60" x2="60" y2="34" stroke={ring} strokeWidth="1.8" strokeLinecap="round" transform="rotate(70 60 60)" />
      <circle cx="60" cy="60" r="2.6" fill={ring} />
    </svg>
  );
}

function SectionHead({ eyebrow, title, children }) {
  return (
    <div className="tv-vault-section-head">
      <div>
        <p className="tv-vault-eyebrow">{eyebrow}</p>
        <h2 className="tv-vault-section-title">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function DemoBadge() {
  return <span className="tv-vault-demo-badge">Demonstration data</span>;
}

function VaultPanel({ collectorNumber, watches, stories, goTo }) {
  return (
    <section aria-labelledby="tv-vault-h-vault">
      <SectionHead eyebrow="Welcome back" title="My Vault">
        <DemoBadge />
      </SectionHead>
      <div className="tv-vault-welcome">
        <h3 id="tv-vault-h-vault" className="tv-vault-welcome-title">Good to see you, Collector.</h3>
        <p className="tv-vault-welcome-text">
          Your private archive is open. Every piece, story and document stays together here — a quiet
          record of the time you keep.
        </p>
        <p className="tv-vault-collector-no">
          Collector No. <strong>{collectorNumber || '—'}</strong>
        </p>
      </div>
      <div className="tv-vault-stats">
        <button type="button" className="tv-vault-stat" onClick={() => goTo('pieces')}>
          <span className="tv-vault-stat-num">{watches.length}</span>
          <span className="tv-vault-stat-label">Timepieces</span>
        </button>
        <button type="button" className="tv-vault-stat" onClick={() => goTo('stories')}>
          <span className="tv-vault-stat-num">{stories.length}</span>
          <span className="tv-vault-stat-label">Stories recorded</span>
        </button>
        <button type="button" className="tv-vault-stat" onClick={() => goTo('archive')}>
          <span className="tv-vault-stat-num">{watches.length * 2}</span>
          <span className="tv-vault-stat-label">Document slots</span>
        </button>
      </div>
    </section>
  );
}

const EMPTY_WATCH = { brand: '', model: '', reference: '', year: '', purchased: '', note: '' };

function PiecesPanel({ watches, onAddWatch }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_WATCH);
  const [errors, setErrors] = useState({});

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!form.brand.trim()) next.brand = 'Please enter a brand.';
    if (!form.model.trim()) next.model = 'Please enter a model.';
    if (!form.reference.trim()) next.reference = 'Please enter a reference.';
    if (form.year.trim()) {
      const y = Number(form.year);
      if (!/^\d{4}$/.test(form.year.trim()) || y < 1850 || y > new Date().getFullYear() + 1) {
        next.year = 'Enter a four-digit year.';
      }
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    onAddWatch({
      brand: form.brand.trim(),
      model: form.model.trim(),
      reference: form.reference.trim(),
      year: form.year.trim() ? Number(form.year) : null,
      purchased: form.purchased,
      warrantyUntil: '',
      note: form.note.trim(),
    });
    setForm(EMPTY_WATCH);
    setOpen(false);
  };

  return (
    <section aria-labelledby="tv-vault-h-pieces">
      <SectionHead eyebrow="The collection" title="My Timepieces">
        <button
          type="button"
          className="tv-vault-btn-solid"
          aria-expanded={open}
          aria-controls="tv-vault-add-watch"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close' : 'Add a Watch'}
        </button>
      </SectionHead>
      <h3 id="tv-vault-h-pieces" className="tv-vault-visually-hidden">Watches in your vault</h3>

      {open ? (
        <form id="tv-vault-add-watch" className="tv-vault-form" onSubmit={submit} noValidate>
          <div className="tv-vault-form-grid">
            <label className="tv-vault-label">
              Brand *
              <input className="tv-vault-text" value={form.brand} onChange={set('brand')} aria-invalid={Boolean(errors.brand)} />
              {errors.brand ? <span className="tv-vault-field-error" role="alert">{errors.brand}</span> : null}
            </label>
            <label className="tv-vault-label">
              Model *
              <input className="tv-vault-text" value={form.model} onChange={set('model')} aria-invalid={Boolean(errors.model)} />
              {errors.model ? <span className="tv-vault-field-error" role="alert">{errors.model}</span> : null}
            </label>
            <label className="tv-vault-label">
              Reference *
              <input className="tv-vault-text" value={form.reference} onChange={set('reference')} aria-invalid={Boolean(errors.reference)} />
              {errors.reference ? <span className="tv-vault-field-error" role="alert">{errors.reference}</span> : null}
            </label>
            <label className="tv-vault-label">
              Year
              <input className="tv-vault-text" inputMode="numeric" maxLength={4} value={form.year} onChange={set('year')} aria-invalid={Boolean(errors.year)} />
              {errors.year ? <span className="tv-vault-field-error" role="alert">{errors.year}</span> : null}
            </label>
            <label className="tv-vault-label">
              Purchase date
              <input className="tv-vault-text" type="date" value={form.purchased} onChange={set('purchased')} />
            </label>
            <label className="tv-vault-label tv-vault-label-wide">
              A note
              <input className="tv-vault-text" value={form.note} onChange={set('note')} />
            </label>
          </div>
          <div className="tv-vault-form-actions">
            <button type="submit" className="tv-vault-btn-solid">Add to my vault</button>
            <button type="button" className="tv-vault-btn-ghost" onClick={() => { setOpen(false); setErrors({}); }}>
              Cancel
            </button>
          </div>
          <p className="tv-vault-fineprint">Demo only: added watches live in this page and are not saved.</p>
        </form>
      ) : null}

      <ul className="tv-vault-cards">
        {watches.map((w) => (
          <li key={w.id} className="tv-vault-card">
            <div className="tv-vault-card-art">
              <WatchGlyph dial={w.dial} ring={w.ring} strap={w.strap} />
            </div>
            <div className="tv-vault-card-body">
              <p className="tv-vault-card-brand">{w.brand}</p>
              <h3 className="tv-vault-card-model">{w.model}</h3>
              <p className="tv-vault-card-meta">
                Ref. {w.reference}
                {w.year ? ` · ${w.year}` : ''}
              </p>
              {w.note ? <p className="tv-vault-card-note">{w.note}</p> : null}
            </div>
          </li>
        ))}
      </ul>
      <DemoBadge />
    </section>
  );
}

function StoriesPanel({ watches, stories, onAddStory }) {
  const [form, setForm] = useState({ watchId: '', title: '', text: '' });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const nameOf = (id) => {
    const w = watches.find((x) => x.id === Number(id));
    return w ? `${w.brand} ${w.model}` : 'Unassigned';
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.text.trim()) {
      setError('Please add a title and a few words.');
      return;
    }
    setError('');
    onAddStory({
      watchId: form.watchId ? Number(form.watchId) : (watches[0] && watches[0].id) || 0,
      title: form.title.trim(),
      text: form.text.trim(),
      date: new Date().toISOString().slice(0, 10),
    });
    setForm({ watchId: form.watchId, title: '', text: '' });
  };

  return (
    <section aria-labelledby="tv-vault-h-stories">
      <SectionHead eyebrow="In your own words" title="Stories & Memories">
        <DemoBadge />
      </SectionHead>
      <h3 id="tv-vault-h-stories" className="tv-vault-visually-hidden">Recorded stories</h3>
      <ul className="tv-vault-stories">
        {stories.map((s) => (
          <li key={s.id} className="tv-vault-story">
            <p className="tv-vault-story-meta">
              {nameOf(s.watchId)} · {formatDate(s.date)}
            </p>
            <h3 className="tv-vault-story-title">{s.title}</h3>
            <p className="tv-vault-story-text">{s.text}</p>
          </li>
        ))}
      </ul>

      <form className="tv-vault-form" onSubmit={submit} noValidate>
        <h3 className="tv-vault-form-title">Add a memory</h3>
        <div className="tv-vault-form-grid">
          <label className="tv-vault-label">
            Timepiece
            <select className="tv-vault-text" value={form.watchId} onChange={set('watchId')}>
              <option value="">{watches.length ? 'Choose a watch' : 'No watches yet'}</option>
              {watches.map((w) => (
                <option key={w.id} value={w.id}>{`${w.brand} ${w.model}`}</option>
              ))}
            </select>
          </label>
          <label className="tv-vault-label">
            Title
            <input className="tv-vault-text" value={form.title} onChange={set('title')} />
          </label>
          <label className="tv-vault-label tv-vault-label-wide">
            Your story
            <textarea className="tv-vault-text tv-vault-textarea" rows={3} value={form.text} onChange={set('text')} />
          </label>
        </div>
        {error ? <p className="tv-vault-field-error" role="alert">{error}</p> : null}
        <div className="tv-vault-form-actions">
          <button type="submit" className="tv-vault-btn-solid">Save memory</button>
        </div>
      </form>
    </section>
  );
}

function ArchivePanel({ watches }) {
  return (
    <section aria-labelledby="tv-vault-h-archive">
      <SectionHead eyebrow="Provenance" title="Ownership Archive">
        <DemoBadge />
      </SectionHead>
      <h3 id="tv-vault-h-archive" className="tv-vault-visually-hidden">Ownership records</h3>
      <div className="tv-vault-table-wrap">
        <table className="tv-vault-table">
          <thead>
            <tr>
              <th scope="col">Timepiece</th>
              <th scope="col">Reference</th>
              <th scope="col">Purchased</th>
              <th scope="col">Warranty</th>
              <th scope="col">Documents</th>
            </tr>
          </thead>
          <tbody>
            {watches.map((w) => (
              <tr key={w.id}>
                <th scope="row">{`${w.brand} ${w.model}`}</th>
                <td>{w.reference}</td>
                <td>{formatDate(w.purchased)}</td>
                <td>{warrantyLabel(w.warrantyUntil)}</td>
                <td>
                  <span className="tv-vault-pill">Warranty card · placeholder</span>
                  <span className="tv-vault-pill">Invoice · placeholder</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tv-vault-fineprint">
        Document uploads are placeholders in this demonstration. Nothing is stored or transmitted.
      </p>
    </section>
  );
}

function ProfilePanel({ collectorNumber }) {
  const rows = [
    ['Name', 'Demo Collector'],
    ['Collector number', collectorNumber || '—'],
    ['Member since', '2026'],
    ['Preferred contact', 'collector@example.com'],
    ['Collecting focus', 'Dress watches and everyday automatics'],
  ];
  return (
    <section aria-labelledby="tv-vault-h-profile">
      <SectionHead eyebrow="About you" title="Collector Profile">
        <DemoBadge />
      </SectionHead>
      <h3 id="tv-vault-h-profile" className="tv-vault-visually-hidden">Profile details</h3>
      <dl className="tv-vault-profile">
        {rows.map(([k, v]) => (
          <div key={k} className="tv-vault-profile-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Dashboard({ collectorNumber, onReturnToEntry, onReturnToStore }) {
  const [tab, setTab] = useState('vault');
  const [watches, setWatches] = useState(SAMPLE_WATCHES);
  const [stories, setStories] = useState(SAMPLE_STORIES);
  const nextId = useRef(1000);

  const addWatch = (w) => {
    nextId.current += 1;
    const palette = DIAL_PALETTE[nextId.current % DIAL_PALETTE.length];
    setWatches((list) => [...list, { id: nextId.current, ...palette, ...w }]);
  };
  const addStory = (s) => {
    nextId.current += 1;
    setStories((list) => [{ id: nextId.current, ...s }, ...list]);
  };

  return (
    <div className="tv-vault-shell">
      <header className="tv-vault-header">
        <Brand />
        <div className="tv-vault-header-actions">
          <button type="button" className="tv-vault-ghost-btn" onClick={onReturnToEntry}>
            Return to vault entry
          </button>
          {onReturnToStore ? (
            <button type="button" className="tv-vault-ghost-btn" onClick={onReturnToStore}>
              Return to store
            </button>
          ) : null}
        </div>
      </header>

      <main className="tv-vault-dash">
        <div className="tv-vault-tabs" role="tablist" aria-label="Private vault sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tv-vault-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="tv-vault-tabpanel"
              className="tv-vault-tab"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div id="tv-vault-tabpanel" role="tabpanel" aria-labelledby={`tv-vault-tab-${tab}`} className="tv-vault-panel">
          {tab === 'vault' ? (
            <VaultPanel collectorNumber={collectorNumber} watches={watches} stories={stories} goTo={setTab} />
          ) : null}
          {tab === 'pieces' ? <PiecesPanel watches={watches} onAddWatch={addWatch} /> : null}
          {tab === 'stories' ? <StoriesPanel watches={watches} stories={stories} onAddStory={addStory} /> : null}
          {tab === 'archive' ? <ArchivePanel watches={watches} /> : null}
          {tab === 'profile' ? <ProfilePanel collectorNumber={collectorNumber} /> : null}
        </div>

        <p className="tv-vault-fineprint tv-vault-dash-note">
          Demonstration mode: this vault is a front-end preview. Real collections must be protected by
          server-side authentication.
        </p>
      </main>
    </div>
  );
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */
function PrivateVault({ onClose }) {
  const [stage, setStage] = useState('card');
  const [cardValue, setCardValue] = useState('');
  const [cardError, setCardError] = useState('');
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [focusToken, setFocusToken] = useState(0);
  const [collectorNumber, setCollectorNumber] = useState('');
  const [boxKey, setBoxKey] = useState(0);
  const [boxFailed, setBoxFailed] = useState(false);

  const stageRef = useRef(stage);
  stageRef.current = stage;
  const verifiedCard = useRef(''); // in memory only — never persisted
  const busy = useRef(false);
  const alive = useRef(true);
  const timers = useRef(new Set());

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      if (alive.current) fn();
    }, ms);
    timers.current.add(id);
  }, []);

  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const isOpen = OPEN_STAGES.includes(stage);

  /* lid callbacks from the 3D box */
  const handleOpenComplete = useCallback(() => {
    setStage((s) => (s === 'opening' ? 'pin' : s));
  }, []);
  const handleCloseComplete = useCallback(() => {
    setStage((s) => (s === 'closing' ? 'card' : s));
  }, []);
  const handleBoxError = useCallback(() => setBoxFailed(true), []);

  /* If 3D is unavailable the stages must still advance */
  useEffect(() => {
    if (!boxFailed) return;
    if (stage === 'opening') later(() => setStage((s) => (s === 'opening' ? 'pin' : s)), 600);
    if (stage === 'closing') later(() => setStage((s) => (s === 'closing' ? 'card' : s)), 400);
  }, [boxFailed, stage, later]);

  useEffect(() => {
    if (stage === 'pin') setFocusToken((t) => t + 1);
  }, [stage]);

  /* Stage B: special card number */
  const submitCard = useCallback(
    async (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (busy.current || stageRef.current !== 'card') return;
      const value = normalizeCard(cardValue);
      if (!value) {
        setCardError('Please enter your Special Card Number.');
        return;
      }
      if (!CARD_PATTERN.test(value)) {
        setCardError('Card numbers look like TV-0000-000.');
        return;
      }
      busy.current = true;
      setCardError('');
      setStage('checking');
      let result;
      try {
        result = await verifyCardNumber(value);
      } catch (err) {
        result = { ok: false, message: 'We couldn’t reach the vault. Please try again.' };
      }
      busy.current = false;
      if (!alive.current) return;
      if (!result.ok) {
        setStage('card');
        setCardError(result.message || 'We couldn’t verify that card number.');
        return;
      }
      verifiedCard.current = value;
      setCollectorNumber(result.collectorNumber || value);
      setStage('verified');
      later(() => setStage((s) => (s === 'verified' ? 'opening' : s)), 1100);
    },
    [cardValue, later]
  );

  /* Stage D: four-digit PIN */
  const submitPin = useCallback(
    async (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (busy.current || stageRef.current !== 'pin') return;
      if (!/^\d{4}$/.test(pinValue)) {
        setPinError('Enter all four digits.');
        setShakeKey((k) => k + 1);
        return;
      }
      busy.current = true;
      setPinError('');
      setStage('pinChecking');
      let result;
      try {
        result = await verifyPin(verifiedCard.current, pinValue);
      } catch (err) {
        result = { ok: false };
      }
      busy.current = false;
      if (!alive.current) return;
      if (!result.ok) {
        setPinValue('');
        setPinError('Incorrect PIN. Please try again.');
        setShakeKey((k) => k + 1);
        setStage('pin');
        setFocusToken((t) => t + 1);
        return;
      }
      setPinValue('');
      setStage('granted');
      later(() => setStage((s) => (s === 'granted' ? 'dashboard' : s)), 1000);
    },
    [pinValue, later]
  );

  const changePin = useCallback((raw) => {
    setPinValue(raw.replace(/\D/g, '').slice(0, 4));
    setPinError('');
  }, []);
  const pressDigit = useCallback((d) => {
    setPinValue((v) => (v.length < 4 ? v + d : v));
    setPinError('');
  }, []);
  const backspacePin = useCallback(() => setPinValue((v) => v.slice(0, -1)), []);
  const clearPin = useCallback(() => {
    setPinValue('');
    setPinError('');
  }, []);

  const changeCard = useCallback((raw) => {
    setCardValue(raw.toUpperCase());
    setCardError('');
  }, []);

  /* "Use a different card": close the lid, then return to card entry */
  const cancelPin = useCallback(() => {
    if (stageRef.current !== 'pin') return;
    verifiedCard.current = '';
    setPinValue('');
    setPinError('');
    setCardValue('');
    setCardError('');
    setStage('closing');
  }, []);

  /* Dashboard -> vault entry (box remounts closed) */
  const returnToEntry = useCallback(() => {
    verifiedCard.current = '';
    busy.current = false;
    setCardValue('');
    setCardError('');
    setPinValue('');
    setPinError('');
    setCollectorNumber('');
    setStage('card');
    setBoxKey((k) => k + 1);
  }, []);

  const handleClose = typeof onClose === 'function' ? onClose : undefined;

  if (stage === 'dashboard') {
    return (
      <div className="tv-vault" role="region" aria-label="TIMEVAULT Private Vault dashboard">
        <Dashboard
          collectorNumber={collectorNumber}
          onReturnToEntry={returnToEntry}
          onReturnToStore={handleClose}
        />
      </div>
    );
  }

  const topScreen = (
    <CardScreen stage={stage} value={cardValue} error={cardError} onChange={changeCard} onSubmit={submitCard} />
  );
  const innerScreen = (
    <PinScreen
      stage={stage}
      value={pinValue}
      error={pinError}
      shakeKey={shakeKey}
      focusToken={focusToken}
      onChange={changePin}
      onDigit={pressDigit}
      onBackspace={backspacePin}
      onClear={clearPin}
      onSubmit={submitPin}
      onCancel={cancelPin}
    />
  );

  const showPinInFallback = stage === 'pin' || stage === 'pinChecking' || stage === 'granted';

  return (
    <div className="tv-vault" role="region" aria-label="TIMEVAULT Private Vault">
      <div className="tv-vault-shell">
        <header className="tv-vault-header">
          <Brand />
          {handleClose ? (
            <button type="button" className="tv-vault-ghost-btn" onClick={handleClose}>
              ← Back to store
            </button>
          ) : null}
        </header>

        <section className="tv-vault-hero">
          <h1 className="tv-vault-title">Your time. Your legacy.</h1>
          <p className="tv-vault-subtitle">A private space for the timepieces and stories that matter.</p>
        </section>

        <main className="tv-vault-stage">
          <div className="tv-vault-canvas-wrap">
            {boxFailed ? (
              <div className="tv-vault-fallback">
                <p className="tv-vault-fallback-note">
                  The 3D view isn’t available on this device, so here is the access panel on its own.
                </p>
                <div className="tv-vault-fallback-panel">
                  <ScaledPanel
                    designWidth={showPinInFallback ? 640 : 760}
                    designHeight={showPinInFallback ? 800 : 520}
                  >
                    {showPinInFallback ? innerScreen : topScreen}
                  </ScaledPanel>
                </div>
              </div>
            ) : (
              <VaultBox3D
                key={boxKey}
                isOpen={isOpen}
                onOpenComplete={handleOpenComplete}
                onCloseComplete={handleCloseComplete}
                onError={handleBoxError}
                innerScreen={innerScreen}
              >
                {topScreen}
              </VaultBox3D>
            )}
          </div>
          <p className="tv-vault-hint">Drag to turn the box · scroll or pinch to zoom</p>
          <p className="tv-vault-note">
            Demonstration mode: credentials are checked in your browser and are not secure. A real vault
            authenticates on a server.
          </p>
        </main>
      </div>
    </div>
  );
}

export { PrivateVault };
export default PrivateVault;
