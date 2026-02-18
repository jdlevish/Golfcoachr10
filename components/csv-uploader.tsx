'use client';

import Papa from 'papaparse';
import { useMemo, useState } from 'react';
import { mapRowsToShots, summarizeSession, type ShotRecord } from '@/lib/r10';

const formatValue = (value: number | null, suffix = '') =>
  value === null ? '—' : `${value.toFixed(1)}${suffix}`;

export default function CsvUploader() {
  const [shots, setShots] = useState<ShotRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => summarizeSession(shots), [shots]);

  const onFileChange = (file: File) => {
    setError(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const nextShots = mapRowsToShots(results.data);
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
        <span>Choose an exported range session to parse and summarize.</span>
      </label>

      {error && <p className="error">{error}</p>}

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
          </section>

          <section>
            <h2>By Club</h2>
            <table>
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Shots</th>
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
