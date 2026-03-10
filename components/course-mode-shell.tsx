'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AppBottomNav, AppCard, AppHeaderBar, AppPageShell, buildPrimaryNav } from '@/components/app-shell';

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

const fmt = (value: number | null, suffix = '') => (value === null ? '-' : `${value.toFixed(1)}${suffix}`);

const confidenceTone = (value: Confidence) => {
  if (value === 'High') return 'badge-success';
  if (value === 'Medium') return 'badge-warning';
  return 'badge-neutral';
};

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
  const [loggingShot, setLoggingShot] = useState(false);
  const [logStatus, setLogStatus] = useState<string | null>(null);

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
    setLogStatus(null);
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

  const logShot = async () => {
    setLoggingShot(true);
    setLogStatus(null);

    const response = await fetch('/api/coach/drills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drillName: `Course Mode - ${featured.club}`,
        durationMins: 1,
        notes: `Target ${result ? result.adjustedTargetCarry.toFixed(1) : targetCarry} yds | Wind ${windDirection} ${windMph} mph | Lie ${lie} | Confidence ${featured.confidence}`,
        recommendationSource: 'manual'
      })
    }).catch(() => null);

    if (!response || !response.ok) {
      setLogStatus('Could not log shot.');
      setLoggingShot(false);
      return;
    }

    setLogStatus(`Shot logged for ${featured.club}.`);
    setLoggingShot(false);
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
  const navItems = buildPrimaryNav('More');

  return (
    <AppPageShell className="course-mode-page">
      <AppHeaderBar title="Course Mode" backHref="/" className="course-mode-topbar" />

      <AppCard className="course-input-card" bodyClassName="course-input-card-body">
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
      </AppCard>

      <AppCard className="course-hero-card" bodyClassName="course-hero-card-body">
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
      </AppCard>

      <AppCard title="Recommendation Details" className="course-details-card" bodyClassName="course-details-card-body">
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
      </AppCard>

      <AppCard title="Quick Checks" className="course-utility-card" bodyClassName="course-utility-card-body">
        <div className="course-utility-list">
          {utilityRows.map((row) => (
            <div key={row.label} className="list-row course-utility-row">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      </AppCard>

      <div className="course-action-stack">
        <a href={featured.trendHref} className="secondary-button course-secondary-link">
          View Recent Results
        </a>
        <button type="button" className="primary-button course-primary-cta" onClick={() => void logShot()} disabled={loggingShot}>
          {loggingShot ? 'Logging Shot...' : 'Log Shot'}
        </button>
      </div>
      {logStatus ? <p className={logStatus.includes('Could not') ? 'error' : 'helper-text'}>{logStatus}</p> : null}

      <AppBottomNav items={navItems} className="course-bottom-nav" />
    </AppPageShell>
  );
}
