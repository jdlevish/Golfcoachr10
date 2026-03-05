'use client';

import { useEffect, useMemo, useState } from 'react';

type Alias = {
  id: string;
  raw: string;
  normalized: string;
  createdAt: string;
};

type DetectedRaw = {
  raw: string;
  rawKey: string;
  count: number;
  normalizedDetected: string[];
  mappedNormalized: string;
  mappingSource: 'exact' | 'alias' | 'heuristic';
};

type SettingsPayload = {
  aliases: Alias[];
  detectedRaw: DetectedRaw[];
  warnings: Array<{ raw: string; message: string }>;
  suggestions: string[];
};

type Props = {
  refreshKey: number;
};

export default function ClubAliasSettings({ refreshKey }: Props) {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingRaw, setSavingRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    const response = await fetch('/api/settings/club-aliases', { cache: 'no-store' }).catch(() => null);
    if (!response || !response.ok) {
      setError('Could not load club settings.');
      setLoading(false);
      return;
    }
    const payload = (await response.json()) as SettingsPayload;
    setData(payload);
    setDrafts(
      Object.fromEntries(payload.detectedRaw.map((item) => [item.rawKey, item.mappingSource === 'alias' ? item.mappedNormalized : '']))
    );
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [refreshKey]);

  const suggestions = useMemo(() => data?.suggestions ?? [], [data?.suggestions]);

  const saveAlias = async (raw: string, rawKey: string) => {
    const normalized = drafts[rawKey]?.trim();
    if (!normalized) return;
    setSavingRaw(raw);
    const response = await fetch('/api/settings/club-aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw, normalized })
    });
    if (!response.ok) {
      setSavingRaw(null);
      setError('Could not save alias.');
      return;
    }
    await load();
    setSavingRaw(null);
  };

  const removeAlias = async (raw: string) => {
    setSavingRaw(raw);
    const response = await fetch('/api/settings/club-aliases', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw })
    });
    if (!response.ok) {
      setSavingRaw(null);
      setError('Could not remove alias.');
      return;
    }
    await load();
    setSavingRaw(null);
  };

  return (
    <section className="stack">
      {loading && <p className="helper-text">Loading club settings...</p>}
      {error && <p className="error">{error}</p>}
      {data?.warnings.length ? (
        <article className="coach-card">
          <h3>Normalization Warnings</h3>
          <ul>
            {data.warnings.map((warning) => (
              <li key={warning.raw}>{warning.message}</li>
            ))}
          </ul>
        </article>
      ) : null}
      <article className="coach-card">
        <h3>Detected Club Labels</h3>
        {!data || data.detectedRaw.length === 0 ? (
          <p className="helper-text">No saved shot labels found yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Raw</th>
                <th>Shots</th>
                <th>Mapped</th>
                <th>Source</th>
                <th>Alias</th>
              </tr>
            </thead>
            <tbody>
              {data.detectedRaw.map((item) => (
                <tr key={item.rawKey}>
                  <td data-label="Raw">{item.raw}</td>
                  <td data-label="Shots">{item.count}</td>
                  <td data-label="Mapped">{item.mappedNormalized}</td>
                  <td data-label="Source">{item.mappingSource}</td>
                  <td data-label="Alias">
                    <div className="inline-actions">
                      <input
                        list="club-normalized-suggestions"
                        value={drafts[item.rawKey] ?? ''}
                        onChange={(event) => setDrafts((prev) => ({ ...prev, [item.rawKey]: event.target.value }))}
                        placeholder="Set alias"
                        disabled={item.mappingSource === 'exact' || savingRaw === item.raw}
                      />
                      <button
                        type="button"
                        onClick={() => void saveAlias(item.raw, item.rawKey)}
                        disabled={item.mappingSource === 'exact' || savingRaw === item.raw || !(drafts[item.rawKey] ?? '').trim()}
                      >
                        Save
                      </button>
                      {item.mappingSource === 'alias' && (
                        <button type="button" onClick={() => void removeAlias(item.raw)} disabled={savingRaw === item.raw}>
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <datalist id="club-normalized-suggestions">
          {suggestions.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </article>
      <article className="coach-card">
        <h3>Saved Aliases</h3>
        {!data || data.aliases.length === 0 ? (
          <p className="helper-text">No custom aliases saved.</p>
        ) : (
          <ul>
            {data.aliases.map((alias) => (
              <li key={alias.id}>
                {alias.raw} → {alias.normalized}
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
