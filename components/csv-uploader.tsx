'use client';

import Papa from 'papaparse';
import { useEffect, useMemo, useState } from 'react';
import { computeCoachDiagnosis } from '@/lib/coach-diagnosis';
import {
  computeMissPatterns,
  buildImportReport,
  inferSessionDateFromRows,
  mapRowsToShots,
  summarizeSession,
  toNormalizedShotsFromShotRecords,
  type ImportReport,
  type Shape,
  type ShotRecord
} from '@/lib/r10';
import { toStoredShots } from '@/lib/session-storage';

const formatValue = (value: number | null, suffix = '') =>
  value === null ? '-' : `${value.toFixed(1)}${suffix}`;

const formatList = (values: string[]) => (values.length ? values.join(', ') : '-');

const formatBreakdownTerms = (terms: Record<string, number | null>) =>
  Object.entries(terms)
    .map(([key, value]) => `${key}=${typeof value === 'number' ? value.toFixed(2) : 'n/a'}`)
    .join(', ') || 'n/a';

type CsvUploaderProps = {
  onSessionSaved?: () => void;
};

type UploadView = 'import' | 'coach' | 'gapping' | 'deepdive';

type LadderRow = {
  club: string;
  carryMedian: number;
  p10Carry: number | null;
  p90Carry: number | null;
  gapToNext: number | null;
  status: 'overlap' | 'compressed' | 'healthy' | 'cliff' | null;
  warning: string | null;
};

const buildPracticePlanStub = (constraintType: string, club: string) => {
  if (constraintType === 'DirectionConsistency') {
    return [
      `Alignment-gate start line block (${club})`,
      'Face-to-path control reps with one shot shape',
      'Target-switch transfer set to validate dispersion'
    ];
  }
  if (constraintType === 'FaceControl') {
    return [
      `Face-awareness drill block (${club})`,
      'Narrow shape rehearsal with launch-direction checks',
      'Pressure set to hold face-to-path windows'
    ];
  }
  if (constraintType === 'DistanceControl') {
    return [
      `Carry ladder block (${club})`,
      'Tempo and speed window stabilization reps',
      'Random distance challenge with carry targets'
    ];
  }
  return [
    `Centered-contact and smash stability reps (${club})`,
    'Strike-quality maintenance set',
    'Transfer set with changing targets'
  ];
};

export default function CsvUploader({ onSessionSaved }: CsvUploaderProps) {
  const [shots, setShots] = useState<ShotRecord[]>([]);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [savingSession, setSavingSession] = useState(false);
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [view, setView] = useState<UploadView>('import');
  const [excludeOutliers, setExcludeOutliers] = useState(false);
  const [selectedClub, setSelectedClub] = useState<'all' | string>('all');

  const navigate = (nextView: UploadView, replace = false) => {
    setView(nextView);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.hash = `upload-${nextView}`;
    if (replace) {
      window.history.replaceState({ uploadView: nextView }, '', url);
      return;
    }
    window.history.pushState({ uploadView: nextView }, '', url);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const parseHash = (): UploadView | null => {
      const hash = window.location.hash;
      if (!hash.startsWith('#upload-')) return null;
      const next = hash.replace('#upload-', '');
      if (next === 'import' || next === 'coach' || next === 'gapping' || next === 'deepdive') {
        return next;
      }
      return null;
    };

    const fromHash = parseHash();
    if (fromHash) {
      setView(fromHash);
    } else {
      const url = new URL(window.location.href);
      url.hash = `upload-${view}`;
      window.history.replaceState({ uploadView: view }, '', url);
    }

    const onPopState = (event: PopStateEvent) => {
      const next = event.state?.uploadView as UploadView | undefined;
      if (next === 'import' || next === 'coach' || next === 'gapping' || next === 'deepdive') {
        setView(next);
        return;
      }
      const fallback = parseHash();
      if (fallback) setView(fallback);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [view]);

  const analysisShots = useMemo(
    () => (excludeOutliers ? shots.filter((shot) => !shot.isOutlier) : shots),
    [excludeOutliers, shots]
  );

  const summary = useMemo(() => summarizeSession(analysisShots), [analysisShots]);
  const normalizedShots = useMemo(() => toNormalizedShotsFromShotRecords(analysisShots), [analysisShots]);
  const missPatterns = useMemo(() => computeMissPatterns(normalizedShots), [normalizedShots]);
  const coachDiagnosis = useMemo(() => computeCoachDiagnosis(normalizedShots), [normalizedShots]);

  const topThreeShapes = useMemo(() => {
    return Object.entries(missPatterns.overall.distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3) as Array<[Shape, number]>;
  }, [missPatterns]);

  const primaryMetricLabel = useMemo(() => {
    const primary = coachDiagnosis.primary;
    if (primary.constraintType === 'DirectionConsistency') return 'offlineStdDev';
    if (primary.constraintType === 'FaceControl') return 'faceToPathStdDev';
    if (primary.constraintType === 'DistanceControl') return 'carryStdDev';
    return 'smashStdDev';
  }, [coachDiagnosis]);

  const primaryMetricValue = coachDiagnosis.primary.keyMetrics[primaryMetricLabel] ?? null;

  const ladderRows = useMemo(() => {
    const ranked = [...summary.clubs]
      .map((club) => ({
        club: club.displayName,
        carryMedian: club.medianCarryYds ?? club.avgCarryYds,
        p10Carry: club.p10CarryYds,
        p90Carry: club.p90CarryYds
      }))
      .filter((club): club is { club: string; carryMedian: number; p10Carry: number | null; p90Carry: number | null } =>
        club.carryMedian !== null
      )
      .sort((a, b) => b.carryMedian - a.carryMedian);

    const rows: LadderRow[] = [];
    for (let i = 0; i < ranked.length; i += 1) {
      const current = ranked[i];
      const next = ranked[i + 1];
      const gapToNext = next ? Number((current.carryMedian - next.carryMedian).toFixed(1)) : null;
      let status: LadderRow['status'] = null;
      if (gapToNext !== null) {
        if (gapToNext < 5) status = 'overlap';
        else if (gapToNext < 8) status = 'compressed';
        else if (gapToNext > 18) status = 'cliff';
        else status = 'healthy';
      }
      let warning: string | null = null;
      if (status === 'overlap') warning = `${current.club} overlaps next club (${gapToNext?.toFixed(1)} yds).`;
      if (status === 'cliff') warning = `${current.club} has a distance cliff to next club (${gapToNext?.toFixed(1)} yds).`;

      rows.push({
        club: current.club,
        carryMedian: current.carryMedian,
        p10Carry: current.p10Carry,
        p90Carry: current.p90Carry,
        gapToNext,
        status,
        warning
      });
    }
    return rows;
  }, [summary.clubs]);

  const availableClubs = useMemo(() => {
    return Array.from(new Set(analysisShots.map((shot) => shot.displayClub))).sort((a, b) => a.localeCompare(b));
  }, [analysisShots]);

  const deepDiveShots = useMemo(() => {
    if (selectedClub === 'all') return analysisShots;
    return analysisShots.filter((shot) => shot.displayClub === selectedClub);
  }, [analysisShots, selectedClub]);

  const dispersionPoints = useMemo(() => {
    const valid = deepDiveShots.filter(
      (shot): shot is ShotRecord & { sideYds: number; carryYds: number } =>
        typeof shot.sideYds === 'number' && typeof shot.carryYds === 'number'
    );
    if (!valid.length) return [] as Array<{ x: number; y: number; outlier: boolean }>;
    const width = 520;
    const height = 220;
    const xValues = valid.map((shot) => shot.sideYds);
    const yValues = valid.map((shot) => shot.carryYds);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const xSpan = Math.max(1, xMax - xMin);
    const ySpan = Math.max(1, yMax - yMin);
    return valid.map((shot) => ({
      x: ((shot.sideYds - xMin) / xSpan) * width,
      y: height - ((shot.carryYds - yMin) / ySpan) * height,
      outlier: shot.isOutlier
    }));
  }, [deepDiveShots]);

  const onFileChange = (file: File) => {
    setError(null);
    setSaveStatus(null);
    setSourceFileName(file.name);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const nextShots = mapRowsToShots(results.data);
        const report = buildImportReport(results.data, nextShots);
        const inferredSessionDate = inferSessionDateFromRows(results.data);

        setImportReport(report);
        setSessionDate(inferredSessionDate?.isoDate ?? null);

        if (!nextShots.length) {
          setError('No recognizable shot rows were found in this CSV.');
          setShots([]);
          navigate('import', true);
          return;
        }

        setShots(nextShots);
        setExcludeOutliers(false);
        setSelectedClub('all');
        navigate('coach');
      },
      error(parseError) {
        setError(parseError.message);
        setShots([]);
        setImportReport(null);
        setSourceFileName(null);
      }
    });
  };

  const saveSession = async () => {
    if (!shots.length) return;
    setSavingSession(true);
    setSaveStatus(null);

    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceFile: sourceFileName ?? 'manual-upload',
        sessionDate: sessionDate ?? undefined,
        shots: toStoredShots(shots)
      })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setSaveStatus(payload?.error ?? 'Could not save session.');
      setSavingSession(false);
      return;
    }

    setSaveStatus('Session saved.');
    setSavingSession(false);
    onSessionSaved?.();
  };

  return (
    <div className="stack">
      <section className="auth-panel">
        <div className="section-header">
          <h2>Import</h2>
          {shots.length > 0 && (
            <button type="button" onClick={() => navigate('coach')}>
              View Coach
            </button>
          )}
        </div>

        <label className="uploader" htmlFor="csvInput">
          <input
            id="csvInput"
            accept=".csv,text/csv"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileChange(file);
            }}
          />
          <strong>Upload Garmin R10 CSV</strong>
          <span>Choose an exported range session to parse and normalize.</span>
        </label>

        {error && <p className="error">{error}</p>}

        {importReport && (
          <div className="summary-grid" aria-label="Import report summary">
            <article>
              <h3>Shots</h3>
              <p>{importReport.shotCount}</p>
            </article>
            <article>
              <h3>Detected Columns</h3>
              <p>{importReport.detectedColumns.length}</p>
            </article>
            <article>
              <h3>Missing Columns</h3>
              <p>{importReport.missingColumns.length}</p>
            </article>
            <article>
              <h3>Clubs Detected</h3>
              <p>{importReport.clubsDetected.length}</p>
            </article>
            <article>
              <h3>Warnings</h3>
              <p>{importReport.warnings.length}</p>
            </article>
          </div>
        )}

        {importReport && (
          <details className="term-key">
            <summary>ImportReport Details</summary>
            <p>
              <strong>Detected:</strong> {formatList(importReport.detectedColumns)}
            </p>
            <p>
              <strong>Missing:</strong> {formatList(importReport.missingColumns)}
            </p>
            <p>
              <strong>Clubs:</strong> {formatList(importReport.clubsDetected)}
            </p>
            {importReport.warnings.length > 0 && (
              <ul>
                {importReport.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </details>
        )}
      </section>

      {shots.length > 0 && (
        <section className="auth-panel">
          <div className="flow-tabs" role="tablist" aria-label="Session flow screens">
            <button
              type="button"
              className={view === 'coach' ? 'flow-tab active' : 'flow-tab'}
              onClick={() => navigate('coach')}
            >
              Coach
            </button>
            <button
              type="button"
              className={view === 'gapping' ? 'flow-tab active' : 'flow-tab'}
              onClick={() => navigate('gapping')}
            >
              Gapping Ladder
            </button>
            <button
              type="button"
              className={view === 'deepdive' ? 'flow-tab active' : 'flow-tab'}
              onClick={() => navigate('deepdive')}
            >
              Deep Dive
            </button>
          </div>

          <div className="persist-actions">
            <button type="button" onClick={saveSession} disabled={savingSession}>
              {savingSession ? 'Saving session...' : 'Save session to history'}
            </button>
            {saveStatus && <p className="helper-text">{saveStatus}</p>}
            <button type="button" onClick={() => navigate('import')}>
              Back To Import
            </button>
          </div>

          {view === 'coach' && (
            <section className="stack" aria-label="Coach screen">
              <section className="summary-grid" aria-label="Coach landing card">
                <article>
                  <h3>Primary Issue</h3>
                  <p>{coachDiagnosis.primary.constraintType}</p>
                </article>
                <article>
                  <h3>Club</h3>
                  <p>{coachDiagnosis.primary.club}</p>
                </article>
                <article>
                  <h3>Key Metric</h3>
                  <p>
                    {primaryMetricLabel}: {typeof primaryMetricValue === 'number' ? primaryMetricValue.toFixed(2) : 'n/a'}
                  </p>
                </article>
                <article>
                  <h3>Target</h3>
                  <p>Reduce 15-20% over 3 sessions</p>
                </article>
              </section>

              <article className="coach-card">
                <h3>Deterministic Rationale</h3>
                <p>
                  <strong>Primary:</strong> {coachDiagnosis.primary.scoreBreakdown.formula}
                </p>
                <p>{formatBreakdownTerms(coachDiagnosis.primary.scoreBreakdown.terms)}</p>
                {coachDiagnosis.secondary && (
                  <>
                    <p>
                      <strong>Secondary:</strong> {coachDiagnosis.secondary.constraintType} ({coachDiagnosis.secondary.club})
                    </p>
                    <p>{coachDiagnosis.secondary.scoreBreakdown.formula}</p>
                    <p>{formatBreakdownTerms(coachDiagnosis.secondary.scoreBreakdown.terms)}</p>
                  </>
                )}
              </article>

              <article className="coach-card">
                <h3>Miss Pattern Summary</h3>
                <p>
                  Most common miss: <strong>{missPatterns.overall.topShape}</strong>
                </p>
                <p>
                  Severe offline shots: <strong>{missPatterns.overall.severePct.toFixed(1)}%</strong>
                </p>
                <h4>Top 3 Shapes</h4>
                <ul>
                  {topThreeShapes.map(([shape, pct]) => (
                    <li key={shape}>
                      {shape}: {pct.toFixed(1)}%
                    </li>
                  ))}
                </ul>
              </article>

              <article className="coach-card">
                <h3>Practice Plan Stub</h3>
                <ul>
                  {buildPracticePlanStub(coachDiagnosis.primary.constraintType, coachDiagnosis.primary.club).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </article>
            </section>
          )}

          {view === 'gapping' && (
            <section className="stack" aria-label="Gapping ladder screen">
              {ladderRows.length === 0 ? (
                <p className="helper-text">No carry data available for gapping ladder.</p>
              ) : (
                ladderRows.map((row) => (
                  <article key={row.club} className="coach-card">
                    <h3>{row.club}</h3>
                    <p>
                      <strong>Carry Median:</strong> {formatValue(row.carryMedian, ' yds')}
                    </p>
                    <p>
                      <strong>P10-P90:</strong> {formatValue(row.p10Carry, ' yds')} - {formatValue(row.p90Carry, ' yds')}
                    </p>
                    <p>
                      <strong>Gap To Next:</strong> {formatValue(row.gapToNext, ' yds')}
                    </p>
                    <p>
                      <strong>Status:</strong> {row.status ?? '-'}
                    </p>
                    {row.warning && <p className="insight insight-danger">{row.warning}</p>}
                  </article>
                ))
              )}
            </section>
          )}

          {view === 'deepdive' && (
            <section className="stack" aria-label="Deep dive screen">
              <div className="full-range-controls">
                <label htmlFor="deep-dive-club">Club</label>
                <select
                  id="deep-dive-club"
                  value={selectedClub}
                  onChange={(event) => setSelectedClub(event.target.value)}
                >
                  <option value="all">All clubs</option>
                  {availableClubs.map((club) => (
                    <option key={club} value={club}>
                      {club}
                    </option>
                  ))}
                </select>
                <label htmlFor="deep-dive-outliers" className="toggle-row">
                  <input
                    id="deep-dive-outliers"
                    type="checkbox"
                    checked={excludeOutliers}
                    onChange={(event) => setExcludeOutliers(event.target.checked)}
                  />
                  Exclude outliers
                </label>
              </div>

              <article className="viz-card">
                <h3>Dispersion Plot (Offline vs Carry)</h3>
                {dispersionPoints.length > 0 ? (
                  <svg viewBox="0 0 520 220" role="img" aria-label="Dispersion scatter chart">
                    {dispersionPoints.map((point, index) => (
                      <circle
                        key={`${point.x}-${point.y}-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r={3.2}
                        fill={point.outlier ? '#f87171' : 'var(--accent)'}
                      />
                    ))}
                  </svg>
                ) : (
                  <p className="helper-text">Need carry and offline values to render dispersion for this filter.</p>
                )}
              </article>

              <article className="coach-card">
                <h3>Per-Club Miss Snapshot</h3>
                {Object.keys(missPatterns.perClub).length === 0 ? (
                  <p className="helper-text">No miss-pattern data available.</p>
                ) : (
                  <div className="stack compact-gap">
                    {Object.entries(missPatterns.perClub).map(([club, pattern]) => (
                      <details key={club} className="term-key">
                        <summary>{club}</summary>
                        <p>
                          <strong>Most common miss:</strong> {pattern.topShape}
                        </p>
                        <p>
                          <strong>Severe %:</strong> {pattern.severePct.toFixed(1)}%
                        </p>
                      </details>
                    ))}
                  </div>
                )}
              </article>
            </section>
          )}
        </section>
      )}
    </div>
  );
}
