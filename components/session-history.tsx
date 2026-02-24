'use client';

import { useEffect, useState } from 'react';
import type { CoachPlan, GappingLadder, SessionSummary } from '@/lib/r10';
import type { RuleInsight, TrendDeltas } from '@/types/analysis';
import type { CoachV2Plan } from '@/types/coach';

type SessionListItem = {
  id: string;
  sourceFile: string | null;
  importedAt: string;
  shots: number;
  avgCarryYds: number | null;
  avgBallSpeedMph: number | null;
  clubs: number;
};

type SessionDetail = {
  id: string;
  sourceFile: string | null;
  importedAt: string;
  summary: SessionSummary;
  gappingLadder: GappingLadder;
  coachPlan: CoachPlan | null;
  coachV2Plan: CoachV2Plan | null;
  trendDeltas: TrendDeltas | null;
  ruleInsights: RuleInsight[];
};

type AllTimePayload = {
  sessionsCount: number;
  summary: SessionSummary;
  gappingLadder: GappingLadder;
  coachPlan: CoachPlan | null;
  coachV2Plan: CoachV2Plan | null;
  trendDeltas: TrendDeltas | null;
  ruleInsights: RuleInsight[];
};

type SessionHistoryProps = {
  refreshKey: number;
};

const formatNumber = (value: number | null, suffix = '') =>
  value === null ? '-' : `${value.toFixed(1)}${suffix}`;
const formatRange = (low: number | null, high: number | null, suffix = '') => {
  if (low === null || high === null) return '-';
  return `${low.toFixed(1)}${suffix} - ${high.toFixed(1)}${suffix}`;
};
const formatGapStatus = (status: GappingLadder['rows'][number]['gapStatus']) => {
  if (!status) return '-';
  if (status === 'healthy') return 'Healthy';
  if (status === 'compressed') return 'Compressed';
  if (status === 'overlap') return 'Overlap';
  return 'Cliff';
};
const formatDateTime = (value: string) => new Date(value).toLocaleString();
const formatTrendDelta = (delta: number | null, unit: string) => {
  if (delta === null) return '-';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)} ${unit}`;
};

export default function SessionHistory({ refreshKey }: SessionHistoryProps) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [allTime, setAllTime] = useState<AllTimePayload | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setError(null);
      const [sessionsResponse, allTimeResponse] = await Promise.all([
        fetch('/api/sessions', { cache: 'no-store' }),
        fetch('/api/sessions/all-time', { cache: 'no-store' })
      ]);

      if (!sessionsResponse.ok || !allTimeResponse.ok) {
        setError('Could not load session history.');
        return;
      }

      const sessionsPayload = (await sessionsResponse.json()) as { sessions: SessionListItem[] };
      const allTimePayload = (await allTimeResponse.json()) as AllTimePayload;
      setSessions(sessionsPayload.sessions);
      setAllTime(allTimePayload);
      if (!sessionsPayload.sessions.length) {
        setSelectedSession(null);
      }
    };

    void load();
  }, [refreshKey]);

  const loadSession = async (sessionId: string) => {
    setLoadingSessionId(sessionId);
    setError(null);
    const response = await fetch(`/api/sessions/${sessionId}`, { cache: 'no-store' });
    if (!response.ok) {
      setLoadingSessionId(null);
      setError('Could not load selected session.');
      return;
    }
    const payload = (await response.json()) as SessionDetail;
    setSelectedSession(payload);
    setLoadingSessionId(null);
  };

  return (
    <section className="stack" aria-label="Saved sessions">
      <h2>Saved Sessions</h2>
      {error && <p className="error">{error}</p>}

      {allTime && (
        <section className="auth-panel">
          <h3>All-Time Performance</h3>
          <section className="summary-grid" aria-label="All-time summary">
            <article>
              <h3>Sessions</h3>
              <p>{allTime.sessionsCount}</p>
            </article>
            <article>
              <h3>Shots</h3>
              <p>{allTime.summary.shots}</p>
            </article>
            <article>
              <h3>Avg Carry</h3>
              <p>{formatNumber(allTime.summary.avgCarryYds, ' yds')}</p>
            </article>
            <article>
              <h3>Avg Ball Speed</h3>
              <p>{formatNumber(allTime.summary.avgBallSpeedMph, ' mph')}</p>
            </article>
            <article>
              <h3>Avg Spin</h3>
              <p>{formatNumber(allTime.summary.avgSpinRpm, ' rpm')}</p>
            </article>
            <article>
              <h3>Gap Alerts</h3>
              <p>
                {
                  allTime.gappingLadder.rows.filter(
                    (row) => row.gapStatus === 'overlap' || row.gapStatus === 'cliff'
                  ).length
                }
              </p>
            </article>
          </section>

          <h3>Gapping Ladder</h3>
          {allTime.gappingLadder.insights.length > 0 && (
            <ul className="insights-list">
              {allTime.gappingLadder.insights.map((insight) => (
                <li key={insight.message} className={`insight insight-${insight.severity}`}>
                  {insight.message}
                </li>
              ))}
            </ul>
          )}
          {allTime.gappingLadder.rows.length === 0 ? (
            <p className="helper-text">No gapping ladder rows in saved history yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Median Carry</th>
                  <th>P10-P90 Carry</th>
                  <th>Gap To Next</th>
                  <th>Status</th>
                  <th>Warning</th>
                </tr>
              </thead>
              <tbody>
                {allTime.gappingLadder.rows.map((row) => (
                  <tr key={row.club}>
                    <td>{row.displayClub}</td>
                    <td>{formatNumber(row.medianCarryYds, ' yds')}</td>
                    <td>{formatRange(row.p10CarryYds, row.p90CarryYds, ' yds')}</td>
                    <td>{formatNumber(row.gapToNextYds, ' yds')}</td>
                    <td>
                      <span className={`gap-badge ${row.gapStatus ? `gap-${row.gapStatus}` : 'gap-none'}`}>
                        {formatGapStatus(row.gapStatus)}
                      </span>
                    </td>
                    <td>{row.warning ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>By Club</h3>
          {allTime.summary.clubs.length === 0 ? (
            <p className="helper-text">No club stats in saved history yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Shots</th>
                  <th>Median Carry</th>
                  <th>P10-P90 Carry</th>
                  <th>Carry Std Dev</th>
                  <th>Offline Std Dev</th>
                  <th>Avg Carry</th>
                </tr>
              </thead>
              <tbody>
                {allTime.summary.clubs.map((club) => (
                  <tr key={club.name}>
                    <td>{club.displayName}</td>
                    <td>{club.shots}</td>
                    <td>{formatNumber(club.medianCarryYds, ' yds')}</td>
                    <td>{formatRange(club.p10CarryYds, club.p90CarryYds, ' yds')}</td>
                    <td>{formatNumber(club.carryStdDevYds, ' yds')}</td>
                    <td>{formatNumber(club.offlineStdDevYds, ' yds')}</td>
                    <td>{formatNumber(club.avgCarryYds, ' yds')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {allTime.coachV2Plan && (
            <p>
              <strong>Current primary limiter:</strong> {allTime.coachV2Plan.primaryConstraint.label} (confidence{' '}
              {allTime.coachV2Plan.confidence.level}, {allTime.coachV2Plan.confidence.score}/100)
            </p>
          )}
          {allTime.trendDeltas && (
            <>
              <h3>Trend Deltas</h3>
              <p>{allTime.trendDeltas.summary}</p>
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Current</th>
                    <th>Baseline</th>
                    <th>Delta</th>
                    <th>Direction</th>
                  </tr>
                </thead>
                <tbody>
                  {allTime.trendDeltas.metrics.map((metric) => (
                    <tr key={metric.key}>
                      <td>{metric.label}</td>
                      <td>{formatNumber(metric.current, ` ${metric.unit}`)}</td>
                      <td>{formatNumber(metric.baseline, ` ${metric.unit}`)}</td>
                      <td>{formatTrendDelta(metric.delta, metric.unit)}</td>
                      <td>{metric.direction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {allTime.ruleInsights.length > 0 && (
            <>
              <h3>If-Then Insights</h3>
              <ul className="insights-list">
                {allTime.ruleInsights.map((insight) => (
                  <li key={insight.id} className={`insight insight-${insight.severity}`}>
                    <strong>{insight.title}:</strong> {insight.ifThen} Evidence: {insight.evidence} Action: {insight.action}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {!sessions.length ? (
        <p className="helper-text">No saved sessions yet. Upload and save your first range session.</p>
      ) : (
        <section>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Source File</th>
                <th>Shots</th>
                <th>Avg Carry</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.importedAt)}</td>
                  <td>{entry.sourceFile ?? '-'}</td>
                  <td>{entry.shots}</td>
                  <td>{formatNumber(entry.avgCarryYds, ' yds')}</td>
                  <td>
                    <button type="button" onClick={() => void loadSession(entry.id)} disabled={loadingSessionId === entry.id}>
                      {loadingSessionId === entry.id ? 'Loading...' : 'Open'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {selectedSession && (
        <section className="auth-panel">
          <h3>Session Detail</h3>
          <p>
            {formatDateTime(selectedSession.importedAt)} |{' '}
            {selectedSession.sourceFile ?? 'Unknown source'}
          </p>
          <p>
            Shots: {selectedSession.summary.shots} | Avg carry:{' '}
            {formatNumber(selectedSession.summary.avgCarryYds, ' yds')}
          </p>
          <p>
            Clubs tracked: {selectedSession.summary.clubs.length} | Gap alerts:{' '}
            {selectedSession.gappingLadder.rows.filter((row) => row.gapStatus === 'overlap' || row.gapStatus === 'cliff').length}
          </p>
          {selectedSession.coachV2Plan && (
            <>
              <p>
                <strong>Coach focus:</strong> {selectedSession.coachV2Plan.primaryConstraint.label}
              </p>
              <p>
                <strong>Target:</strong> {selectedSession.coachV2Plan.practicePlan.goal}
              </p>
            </>
          )}
          {selectedSession.trendDeltas && (
            <>
              <p>
                <strong>Trend:</strong> {selectedSession.trendDeltas.summary}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Current</th>
                    <th>Baseline</th>
                    <th>Delta</th>
                    <th>Direction</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSession.trendDeltas.metrics.map((metric) => (
                    <tr key={metric.key}>
                      <td>{metric.label}</td>
                      <td>{formatNumber(metric.current, ` ${metric.unit}`)}</td>
                      <td>{formatNumber(metric.baseline, ` ${metric.unit}`)}</td>
                      <td>{formatTrendDelta(metric.delta, metric.unit)}</td>
                      <td>{metric.direction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {selectedSession.ruleInsights.length > 0 && (
            <ul className="insights-list">
              {selectedSession.ruleInsights.map((insight) => (
                <li key={insight.id} className={`insight insight-${insight.severity}`}>
                  <strong>{insight.title}:</strong> {insight.ifThen} Evidence: {insight.evidence} Action: {insight.action}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
