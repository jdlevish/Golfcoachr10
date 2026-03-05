'use client';

import { useState } from 'react';

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

function ClubCard({ club, title, featured = false }: { club: ClubRec; title: string; featured?: boolean }) {
  return (
    <article className={featured ? 'course-card course-card-featured' : 'course-card'}>
      <p className="eyebrow">{title}</p>
      <h2>{club.club}</h2>
      <p>Carry median: {fmt(club.carryMedian, ' yds')}</p>
      <p>Carry std dev: {fmt(club.carryStdDev, ' yds')}</p>
      <p>Offline std dev: {fmt(club.offlineStdDev, ' yds')}</p>
      <p>Confidence: {club.confidence}</p>
      <p>Sessions used: {club.sessionsUsed}</p>
      <a href={club.trendHref}>Open trend</a>
    </article>
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

  return (
    <section className="stack course-mode">
      <article className="auth-panel">
        <div className="course-form-grid">
          <label>
            Target Carry (yds)
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
        <button type="button" onClick={() => void submit()} disabled={loading}>
          {loading ? 'Calculating...' : 'Recommend Club'}
        </button>
        {error && <p className="error">{error}</p>}
      </article>

      {result && (
        <>
          <article className="auth-panel">
            <p>
              Adjusted target: <strong>{result.adjustedTargetCarry.toFixed(1)} yds</strong>
            </p>
            <p>
              Eligible clubs: {result.candidates} | Excluded low-confidence: {result.excludedLowConfidence}
            </p>
          </article>
          <ClubCard club={result.recommended} title="Recommended" featured />
          <section className="course-alt-grid">
            {result.oneUp && <ClubCard club={result.oneUp} title="One Up" />}
            {result.oneDown && <ClubCard club={result.oneDown} title="One Down" />}
          </section>
        </>
      )}
    </section>
  );
}
