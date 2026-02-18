'use client';

import Papa from 'papaparse';
import { useMemo, useState } from 'react';
import {
  buildCoachPlan,
  buildGappingLadder,
  buildImportReport,
  mapRowsToShots,
  summarizeSession,
  type GapStatus,
  type ImportReport,
  type ShotRecord
} from '@/lib/r10';

const formatValue = (value: number | null, suffix = '') =>
  value === null ? '—' : `${value.toFixed(1)}${suffix}`;

const formatRange = (low: number | null, high: number | null, suffix = '') => {
  if (low === null || high === null) return '—';
  return `${low.toFixed(1)}${suffix} – ${high.toFixed(1)}${suffix}`;
};

const formatList = (values: string[]) => (values.length ? values.join(', ') : '—');


const formatGapStatus = (status: GapStatus | null) => {
  if (!status) return '—';
  if (status === 'healthy') return 'Healthy';
  if (status === 'compressed') return 'Compressed';
  if (status === 'overlap') return 'Overlap';
  return 'Cliff';
};

export default function CsvUploader() {
  const [shots, setShots] = useState<ShotRecord[]>([]);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [showOutliers, setShowOutliers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleShots = useMemo(
    () => (showOutliers ? shots : shots.filter((shot) => !shot.isOutlier)),
    [showOutliers, shots]
  );
  const analysisShots = useMemo(() => {
    // If outlier filtering removes every shot, fall back to all shots so coach/gapping still render.
    return visibleShots.length > 0 ? visibleShots : shots;
  }, [shots, visibleShots]);
  const summary = useMemo(() => summarizeSession(analysisShots), [analysisShots]);
  // Keep this as a plain derived value (instead of nested memo dependencies)
  // to avoid any stale-hydration edge cases during hot reloads.
  // Use a distinct identifier name to avoid any stale runtime references after hot reloads.
  const gappingLadder = buildGappingLadder(summary);
  const coachPlan = buildCoachPlan(summary, gappingLadder);
  const problematicGapCount = gappingLadder.rows.filter(
    (row) => row.gapStatus === 'overlap' || row.gapStatus === 'cliff'
  ).length;

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
              <p>{gappingLadder.rows.length}</p>
            </article>
            <article>
              <h3>Gap Alerts</h3>
              <p>{problematicGapCount}</p>
            </article>
          </section>

          {!showOutliers && shots.length > 0 && visibleShots.length === 0 && (
            <p className="helper-text">
              All shots were flagged as outliers, so Coach and Gapping are using the full shot set.
            </p>
          )}

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

            {gappingLadder.insights.length > 0 && (
              <ul className="insights-list">
                {gappingLadder.insights.map((insight) => (
                  <li key={insight.message} className={`insight insight-${insight.severity}`}>
                    {insight.message}
                  </li>
                ))}
              </ul>
            )}

            {gappingLadder.rows.length === 0 ? (
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
                {gappingLadder.rows.map((row) => (
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



          {coachPlan && (
            <section className="coach-card" aria-label="Coach v1">
              <h2>{coachPlan.title}</h2>
              <p>{coachPlan.explanation}</p>
              <p>
                <strong>Target:</strong> {coachPlan.target}
              </p>
              {coachPlan.focusClub && (
                <p>
                  <strong>Focus club:</strong> {coachPlan.focusClub}
                </p>
              )}
              <h3>Next session plan</h3>
              <ul>
                {coachPlan.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </section>
          )}

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
