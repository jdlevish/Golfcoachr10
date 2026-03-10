'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type Confidence = 'High' | 'Medium' | 'Low';

type ClubRec = {
  club: string;
  carryMedian: number;
  carryStdDev: number | null;
  offlineStdDev: number | null;
  confidence: Confidence;
  sessionsUsed: number;
  trendHref: string;
};

type CourseModeResult = {
  adjustedTargetCarry: number;
  recommended: ClubRec;
  oneUp: ClubRec | null;
  oneDown: ClubRec | null;
  candidates: number;
  excludedLowConfidence: number;
};

type NavItem = {
  label: string;
  href: string;
  active?: boolean;
};

const navItems: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Practice', href: '/range-mode' },
  { label: 'Sessions', href: '/dashboard' },
  { label: 'Progress', href: '/trends' },
  { label: 'More', href: '/course-mode', active: true }
];

const fmt = (value: number | null, suffix = '') => (value === null ? '-' : `${value.toFixed(1)}${suffix}`);

const confidenceTone = (value: Confidence) => {
  if (value === 'High') return 'badge-success';
  if (value === 'Medium') return 'badge-warning';
  return 'badge-neutral';
};

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.78 5.97 8.75 12l6.03 6.03-1.59 1.59L5.56 12l7.63-7.62 1.59 1.59Z" fill="currentColor" />
    </svg>
  );
}

function SimpleIcon({ kind }: { kind: 'home' | 'practice' | 'sessions' | 'progress' | 'more' }) {
  const paths = {
    home: 'M4.5 10.5 12 5.25l7.5 5.25v8.25h-4.5v-4.5h-6v4.5H4.5V10.5Z',
    practice: 'M5.25 6.75h13.5v10.5H5.25V6.75Zm2.25 2.25v6h9v-6h-9Z',
    sessions: 'M6 6h12v3H6V6Zm0 4.5h12v7.5H6v-7.5Z',
    progress: 'M6 17.25V12h2.25v5.25H6Zm4.88 0v-9h2.25v9h-2.25Zm4.87 0v-6.75H18v6.75h-2.25Z',
    more: 'M6.75 12a1.5 1.5 0 1 1 0-.01V12Zm5.25 0a1.5 1.5 0 1 1 0-.01V12Zm5.25 0a1.5 1.5 0 1 1 0-.01V12Z'
  } as const;

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[kind]} fill="currentColor" />
    </svg>
  );
}

function AlternateClubRow({ title, club }: { title: string; club: ClubRec | null }) {
  if (!club) return null;

  return (
    <div className="course-option-row">
      <div>
        <p className="course-option-label">{title}</p>
        <p className="course-option-club">{club.club}</p>
      </div>
      <div className="course-option-meta">
        <strong>{fmt(club.carryMedian, ' yds')}</strong>
        <span>{club.confidence} confidence</span>
      </div>
    </div>
  );
}

export default function CourseModeShell() {
  const [targetCarry, setTargetCarry] = useState('150');
  const [windDirection, setWindDirection] = useState<'none' | 'headwind' | 'tailwind'>('none');
  const [windMph, setWindMph] = useState('0');
  const [lie, setLie] = useState<'fairway' | 'rough'>('fairway');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CourseModeResult | null>(null);

  const utilityRows = useMemo(() => {
    // TODO: Bind directional miss-bias from saved shot-pattern data once course-mode input includes target shape context.
    if (!result) {
      return [
        { label: 'Practice Distance', value: `${targetCarry} yds` },
        { label: 'View Recent Results', value: 'Open after recommendation' },
        { label: 'Confidence / Miss Bias', value: 'TODO: bind miss-bias data when available' }
      ];
    }

    return [
      { label: 'Practice Distance', value: `${result.adjustedTargetCarry.toFixed(1)} yds` },
      { label: 'View Recent Results', value: result.recommended.club },
      {
        label: 'Confidence / Miss Bias',
        value:
          result.recommended.offlineStdDev !== null
            ? `${result.recommended.confidence} / ${fmt(result.recommended.offlineStdDev, ' yds spread')}`
            : `${result.recommended.confidence} / TODO: miss bias`
      }
    ];
  }, [result, targetCarry]);

  const submit = async () => {
    const target = Number(targetCarry);
    const wind = Number(windMph);
    if (!Number.isFinite(target) || target <= 0) {
      setError('Enter a valid target carry.');
      return;
    }
    if (!Number.isFinite(wind) || wind < 0) {
      setError('Enter a valid wind speed.');
      return;
    }

    setLoading(true);
    setError(null);
    const response = await fetch('/api/course-mode/recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetCarry: target,
        windDirection,
        windMph: wind,
        lie
      })
    });
    const payload = (await response.json().catch(() => null)) as CourseModeResult | { error?: string } | null;
    if (!response.ok) {
      setResult(null);
      setError(payload && 'error' in payload && payload.error ? payload.error : 'Could not get recommendation.');
      setLoading(false);
      return;
    }
    setResult(payload as CourseModeResult);
    setLoading(false);
  };

  const featured = result?.recommended ?? {
    club: '8 Iron',
    carryMedian: 148,
    carryStdDev: 7.5,
    offlineStdDev: 13.5,
    confidence: 'Medium' as Confidence,
    sessionsUsed: 4,
    trendHref: '/trends'
  };

  return (
    <main className="page-shell course-mode-page">
      <header className="top-bar course-mode-topbar">
        <Link href="/" className="icon-button course-mode-back" aria-label="Back to home">
          <BackIcon />
        </Link>
        <div className="course-mode-heading">
          <h1 className="course-mode-title">Course Mode</h1>
        </div>
      </header>

      <section className="card course-input-card">
        <div className="course-form-grid">
          <label>
            Target Carry
            <input
              type="number"
              inputMode="numeric"
              value={targetCarry}
              onChange={(event) => setTargetCarry(event.target.value)}
            />
          </label>
          <label>
            Wind
            <select value={windDirection} onChange={(event) => setWindDirection(event.target.value as typeof windDirection)}>
              <option value="none">None</option>
              <option value="headwind">Headwind</option>
              <option value="tailwind">Tailwind</option>
            </select>
          </label>
          <label>
            Wind MPH
            <input type="number" inputMode="numeric" value={windMph} onChange={(event) => setWindMph(event.target.value)} />
          </label>
          <label>
            Lie
            <select value={lie} onChange={(event) => setLie(event.target.value as typeof lie)}>
              <option value="fairway">Fairway</option>
              <option value="rough">Rough</option>
            </select>
          </label>
        </div>
        <button type="button" className="primary-button" onClick={() => void submit()} disabled={loading}>
          {loading ? 'Getting Recommendation...' : 'Recommend Club'}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="card course-hero-card">
        <div className="course-hero-banner" />
        <div className="course-hero-body">
          <div className="course-hero-target">
            <span className="card-subtitle">Target Carry</span>
            <strong>{result ? result.adjustedTargetCarry.toFixed(1) : targetCarry} yds</strong>
          </div>
          <div className="course-hero-main">
            <div>
              <p className="course-hero-label">Recommended Club</p>
              <h2 className="course-hero-club">{featured.club}</h2>
            </div>
            <span className={`badge ${confidenceTone(featured.confidence)}`}>{featured.confidence} Confidence</span>
          </div>
          <div className="course-hero-support">
            <span>{windDirection === 'none' ? 'Calm setup' : `${windDirection} ${windMph} mph`}</span>
            <span>{lie === 'rough' ? 'Lie adjusted for rough' : 'Standard fairway lie'}</span>
            {result ? <span>{result.candidates} playable options</span> : <span>Ready for on-course recommendation</span>}
          </div>
        </div>
      </section>

      <section className="card course-details-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Recommendation Details</h2>
          </div>
        </div>
        <div className="course-options-list">
          <AlternateClubRow title="One Up" club={result?.oneUp ?? null} />
          <AlternateClubRow title="Recommended" club={featured} />
          <AlternateClubRow title="One Down" club={result?.oneDown ?? null} />
        </div>
        <p className="course-details-note">
          Carry estimate: {fmt(featured.carryMedian, ' yds')} with {fmt(featured.carryStdDev, ' yds')} carry spread.
        </p>
        <p className="course-details-note">
          Consistency note: {featured.sessionsUsed} recent session{featured.sessionsUsed === 1 ? '' : 's'} behind this call.
        </p>
      </section>

      <section className="card course-utility-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Quick Checks</h2>
          </div>
        </div>
        <div className="course-utility-list">
          {utilityRows.map((row) => (
            <div key={row.label} className="list-row course-utility-row">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className="course-action-stack">
        <Link href={featured.trendHref} className="secondary-button course-secondary-link">
          View Recent Results
        </Link>
        <button type="button" className="primary-button course-primary-cta">
          Log Shot
        </button>
      </div>

      <nav className="bottom-nav course-bottom-nav" aria-label="Primary">
        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`bottom-nav-item${item.active ? ' active' : ''}`}
            aria-current={item.active ? 'page' : undefined}
          >
            <SimpleIcon
              kind={
                item.label === 'Home'
                  ? 'home'
                  : item.label === 'Practice'
                    ? 'practice'
                    : item.label === 'Sessions'
                      ? 'sessions'
                      : item.label === 'Progress'
                        ? 'progress'
                        : 'more'
              }
            />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
