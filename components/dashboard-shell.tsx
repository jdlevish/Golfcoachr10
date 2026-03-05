'use client';

import { useState } from 'react';
import CsvUploader from '@/components/csv-uploader';
import ClubAliasSettings from '@/components/club-alias-settings';
import SessionHistory from '@/components/session-history';

export default function DashboardShell() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showUploader, setShowUploader] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="stack">
      <section className="auth-panel">
        <div className="section-header">
          <h2>Upload Session</h2>
          <button type="button" onClick={() => setShowUploader((value) => !value)}>
            {showUploader ? 'Hide' : 'Show'}
          </button>
        </div>
        {showUploader && <CsvUploader onSessionSaved={() => setRefreshKey((value) => value + 1)} />}
      </section>

      <section className="auth-panel">
        <div className="section-header">
          <h2>Club Settings</h2>
          <button type="button" onClick={() => setShowSettings((value) => !value)}>
            {showSettings ? 'Hide' : 'Show'}
          </button>
        </div>
        {showSettings && <ClubAliasSettings refreshKey={refreshKey} />}
      </section>

      <section className="auth-panel">
        <div className="section-header">
          <h2>Performance & History</h2>
          <button type="button" onClick={() => setShowHistory((value) => !value)}>
            {showHistory ? 'Hide' : 'Show'}
          </button>
        </div>
        {showHistory && <SessionHistory refreshKey={refreshKey} />}
      </section>
    </div>
  );
}
