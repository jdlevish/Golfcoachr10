'use client';

import { useState } from 'react';
import CsvUploader from '@/components/csv-uploader';
import SessionHistory from '@/components/session-history';

export default function DashboardShell() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showUploader, setShowUploader] = useState(false);
  const [showHistory, setShowHistory] = useState(true);

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
