'use client';

import Papa from 'papaparse';
import { useMemo, useState } from 'react';
import { buildImportReport, mapRowsToShots, summarizeSession, type ImportReport, type ShotRecord } from '@/lib/r10';

type GapStatus = 'optimal' | 'compressed' | 'overlap' | 'cliff' | null;

type LadderRow = {
  club: string;
  displayClub: string;
  medianCarryYds: number | null;
  p10CarryYds: number | null;
  p90CarryYds: number | null;
  gapToNextYds: number | null;
  gapStatus: GapStatus;
  warning: string | null;
};

type LadderInsight = {
  message: string;
  severity: 'info' | 'warning' | 'error';
};

type GappingLadder = {
  rows: LadderRow[];
  insights: LadderInsight[];
};

const formatGapStatus = (status: GapStatus): string => {
  switch (status) {
    case 'optimal': return 'Optimal';
    case 'compressed': return 'Compressed';
    case 'overlap': return 'Overlap';
    case 'cliff': return 'Cliff';
    default: return '—';
  }
};

const buildEmptyLadder = (): GappingLadder => ({
  rows: [],
  insights: []
});

/**
 * Builds a gapping ladder from club data, analyzing the distance gaps between clubs
 */
const buildGappingLadder = (clubs: Array<{
  name: string;
  displayName: string;
  medianCarryYds: number | null;
  p10CarryYds: number | null;
  p90CarryYds: number | null;
}>): GappingLadder => {
  // Filter out clubs with no median carry data
  const validClubs = clubs
    .filter(club => club.medianCarryYds !== null)
    .sort((a, b) => {
      // Sort by median carry distance (descending)
      const aCarry = a.medianCarryYds || 0;
      const bCarry = b.medianCarryYds || 0;
      return bCarry - aCarry;
    });

  if (validClubs.length < 2) {
    return {
      rows: validClubs.map(club => ({
        club: club.name,
        displayClub: club.displayName,
        medianCarryYds: club.medianCarryYds,
        p10CarryYds: club.p10CarryYds,
        p90CarryYds: club.p90CarryYds,
        gapToNextYds: null,
        gapStatus: null,
        warning: null
      })),
      insights: validClubs.length === 0 
        ? [{ message: 'No clubs with valid carry data found.', severity: 'info' }]
        : [{ message: 'Need at least two clubs to analyze gapping.', severity: 'info' }]
    };
  }

  // Calculate gaps and analyze them
  const rows: LadderRow[] = [];
  const insights: LadderInsight[] = [];
  let problematicGaps = 0;

  for (let i = 0; i < validClubs.length; i++) {
    const club = validClubs[i];
    const nextClub = i < validClubs.length - 1 ? validClubs[i + 1] : null;
    
    const gapToNextYds = nextClub && club.medianCarryYds && nextClub.medianCarryYds
      ? club.medianCarryYds - nextClub.medianCarryYds
      : null;
    
    // Determine gap status
    let gapStatus: GapStatus = null;
    let warning: string | null = null;
    
    if (gapToNextYds !== null && nextClub) {
      if (gapToNextYds < 0) {
        gapStatus = 'overlap';
        warning = `${club.displayName} carries shorter than ${nextClub.displayName}`;
        problematicGaps++;
      } else if (gapToNextYds < 8) {
        gapStatus = 'compressed';
        warning = `Gap to next club is only ${gapToNextYds.toFixed(1)} yards`;
        problematicGaps++;
      } else if (gapToNextYds > 25) {
        gapStatus = 'cliff';
        warning = `Large ${gapToNextYds.toFixed(1)} yard gap to next club`;
        problematicGaps++;
      } else {
        gapStatus = 'optimal';
      }
    }
    
    rows.push({
      club: club.name,
      displayClub: club.displayName,
      medianCarryYds: club.medianCarryYds,
      p10CarryYds: club.p10CarryYds,
      p90CarryYds: club.p90CarryYds,
      gapToNextYds,
      gapStatus,
      warning
    });
  }

  // Add insights based on analysis
  if (problematicGaps > 0) {
    insights.push({
      message: `Found ${problematicGaps} problematic gaps in your club setup.`,
      severity: problematicGaps > 2 ? 'error' : 'warning'
    });
  } else if (rows.length >= 3) {
    insights.push({
      message: 'All club gaps look good!',
      severity: 'info'
    });
  }

  return { rows, insights };
};

const formatValue = (value: number | null, suffix = '') =>
  value === null ? '—' : `${value.toFixed(1)}${suffix}`;

const formatRange = (low: number | null, high: number | null, suffix = '') => {
  if (low === null || high === null) return '—';
  return `${low.toFixed(1)}${suffix} – ${high.toFixed(1)}${suffix}`;
};

const formatList = (values: string[]) => (values.length ? values.join(', ') : '—');

export default function CsvUploader() {
  const [shots, setShots] = useState<ShotRecord[]>([]);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [showOutliers, setShowOutliers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleShots = useMemo(
    () => (showOutliers ? shots : shots.filter((shot) => !shot.isOutlier)),
    [showOutliers, shots]
  );
  const summary = useMemo(() => summarizeSession(visibleShots), [visibleShots]);
  
  // Build the gapping ladder from the club data in the summary
  const ladder = useMemo<GappingLadder>(() => 
    buildGappingLadder(summary.clubs), 
    [summary.clubs]
  );
  
  // Count of problematic gaps
  const problematicGapCount = useMemo(() => 
    ladder.rows.filter(row => row.gapStatus === 'compressed' || 
                             row.gapStatus === 'overlap' || 
                             row.gapStatus === 'cliff').length, 
    [ladder]);

  const onFileChange = (file: File) => {
    setError(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const nextShots = mapRowsToShots(results.data);
        const report = buildImportReport(results.data, nextShots);

        setImportReport(report);

        if (!nextShots.length) {
          setError('No recognizable shot rows were found in this CSV.');
          setShots([]);
          return;
        }

        setShots(nextShots);
      },
      error(parseError) {
        setError(parseError.message);
        setShots([]);
        setImportReport(null);
      }
    });
  };

  return (
    <div className="stack">
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
        <span>Choose an exported range session to parse, validate, and summarize.</span>
      </label>

      {error && <p className="error">{error}</p>}

      {importReport && (
        <section className="diagnostics" aria-label="Import diagnostics">
          <h2>Import Diagnostics</h2>
          <div className="diagnostics-grid">
            <p>
              <strong>Total rows:</strong> {importReport.totalRows}
            </p>
            <p>
              <strong>Parsed shots:</strong> {importReport.parsedShots}
            </p>
            <p>
              <strong>Dropped rows:</strong> {importReport.droppedRows}
            </p>
            <p>
              <strong>Outlier rows:</strong> {importReport.outlierRows}
            </p>
            <p>
              <strong>Columns detected:</strong> {formatList(importReport.columnsDetected)}
            </p>
            <p>
              <strong>Columns missing:</strong> {formatList(importReport.columnsMissing)}
            </p>
            <p>
              <strong>Clubs detected:</strong> {formatList(importReport.clubsDetected)}
            </p>
          </div>
          {importReport.warnings.length > 0 && (
            <ul>
              {importReport.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {shots.length > 0 && (
        <>
          <section className="summary-grid" aria-label="Session summary">
            <article>
              <h3>Shots</h3>
              <p>{summary.shots}</p>
            </article>
            <article>
              <h3>Avg Carry</h3>
              <p>{formatValue(summary.avgCarryYds, ' yds')}</p>
            </article>
            <article>
              <h3>Avg Ball Speed</h3>
              <p>{formatValue(summary.avgBallSpeedMph, ' mph')}</p>
            </article>
            <article>
              <h3>Avg Spin</h3>
              <p>{formatValue(summary.avgSpinRpm, ' rpm')}</p>
            </article>
            <article>
              <h3>Gapping Rows</h3>
              <p>{ladder.rows.length}</p>
            </article>
            <article>
              <h3>Gap Alerts</h3>
              <p>{problematicGapCount}</p>
            </article>
          </section>

          <label className="toggle-row" htmlFor="showOutliers">
            <input
              id="showOutliers"
              type="checkbox"
              checked={showOutliers}
              onChange={(event) => setShowOutliers(event.target.checked)}
            />
            Include outlier shots in summary calculations
          </label>

          <section>
            <h2>Gapping Ladder</h2>
            <p className="helper-text">
              Sprint 2 Part A: median-carry ladder with adjacent gap health warnings (overlap, compressed, cliff).
            </p>

            {ladder.insights.length > 0 && (
              <ul className="insights-list">
                {ladder.insights.map((insight) => (
                  <li key={insight.message} className={`insight insight-${insight.severity}`}>
                    {insight.message}
                  </li>
                ))}
              </ul>
            )}

            {ladder.rows.length === 0 ? (
              <p className="helper-text">
                No gapping ladder rows yet. Make sure your CSV includes carry distance and at least one recognized club type.
              </p>
            ) : (
              <table>
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Median Carry</th>
                  <th>P10–P90 Carry</th>
                  <th>Gap To Next</th>
                  <th>Status</th>
                  <th>Warning</th>
                </tr>
              </thead>
              <tbody>
                {ladder.rows.map((row) => (
                  <tr key={row.club}>
                    <td>{row.displayClub}</td>
                    <td>{formatValue(row.medianCarryYds, ' yds')}</td>
                    <td>{formatRange(row.p10CarryYds, row.p90CarryYds, ' yds')}</td>
                    <td>{formatValue(row.gapToNextYds, ' yds')}</td>
                    <td>
                      <span className={`gap-badge ${row.gapStatus ? `gap-${row.gapStatus}` : 'gap-none'}`}>
                        {formatGapStatus(row.gapStatus)}
                      </span>
                    </td>
                    <td>{row.warning ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </section>

          <label className="toggle-row" htmlFor="showOutliers">
            <input
              id="showOutliers"
              type="checkbox"
              checked={showOutliers}
              onChange={(event) => setShowOutliers(event.target.checked)}
            />
            Include outlier shots in summary calculations
          </label>

          <section>
            <h2>By Club</h2>
            <p className="helper-text">
              Sprint 1 Part B metrics: median carry, P10–P90 carry band, carry consistency (std dev), and
              directional consistency (offline std dev).
            </p>
            <table>
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Shots</th>
                  <th>Median Carry</th>
                  <th>P10–P90 Carry</th>
                  <th>Carry Std Dev</th>
                  <th>Offline Std Dev</th>
                  <th>Avg Carry</th>
                </tr>
              </thead>
              <tbody>
                {summary.clubs.map((club) => (
                  <tr key={club.name}>
                    <td>
                      <div>{club.displayName}</div>
                      {(club.shotLabels.length > 1 || club.modelLabels.length > 0) && (
                        <small>
                          {club.shotLabels.length > 1 && `Aliases: ${club.shotLabels.join(', ')}`}
                          {club.shotLabels.length > 1 && club.modelLabels.length > 0 && ' • '}
                          {club.modelLabels.length > 0 && `Models: ${club.modelLabels.join(', ')}`}
                        </small>
                      )}
                    </td>
                    <td>{club.shots}</td>
                    <td>{formatValue(club.medianCarryYds, ' yds')}</td>
                    <td>{formatRange(club.p10CarryYds, club.p90CarryYds, ' yds')}</td>
                    <td>{formatValue(club.carryStdDevYds, ' yds')}</td>
                    <td>{formatValue(club.offlineStdDevYds, ' yds')}</td>
                    <td>{formatValue(club.avgCarryYds, ' yds')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
