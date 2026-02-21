'use client';

import { useState } from 'react';
import CsvUploader from '@/components/csv-uploader';
import SessionHistory from '@/components/session-history';

export default function DashboardShell() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="stack">
      <CsvUploader onSessionSaved={() => setRefreshKey((value) => value + 1)} />
      <SessionHistory refreshKey={refreshKey} />
    </div>
  );
}
