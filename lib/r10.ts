/**
 * Garmin R10 CSV normalization and session summarization helpers.
 *
 * Sprint 1 (Part A + B) focus:
 * - resilient column mapping
 * - numeric coercion with locale support
 * - row quality flags and outlier tagging
 * - import diagnostics report for transparency
 * - per-club robust carry/consistency statistics
 */

export type ShotRecord = {
  /** Canonical grouping identity: Garmin-controlled Club Type. */
  clubType: string;
  /** Optional user-entered nickname (can be blank/inconsistent). */
  clubName: string | null;
  /** Optional brand/model metadata. */
  clubModel: string | null;
  /** UI label preferring user nickname when present. */
  displayClub: string;
  ballSpeedMph: number | null;
  launchAngleDeg: number | null;
  carryYds: number | null;
  totalYds: number | null;
  sideYds: number | null;
  spinRpm: number | null;
  /** Row-level data quality flags. */
  isOutlier: boolean;
  /** Any row issues captured during normalization. */
  qualityFlags: string[];
  raw: Record<string, string>;
};

export type ImportReport = {
  totalRows: number;
  parsedShots: number;
  droppedRows: number;
  outlierRows: number;
  columnsDetected: string[];
  columnsMissing: string[];
  clubsDetected: string[];
  warnings: string[];
};

export type SessionSummary = {
  shots: number;
  avgCarryYds: number | null;
  avgBallSpeedMph: number | null;
  avgLaunchAngleDeg: number | null;
  avgSpinRpm: number | null;
  clubs: {
    name: string;
    displayName: string;
    shotLabels: string[];
    modelLabels: string[];
    shots: number;
    avgCarryYds: number | null;
    medianCarryYds: number | null;
    p10CarryYds: number | null;
    p90CarryYds: number | null;
    carryStdDevYds: number | null;
    offlineStdDevYds: number | null;
  }[];
};


export type GapStatus = 'healthy' | 'compressed' | 'overlap' | 'cliff';

export type GappingRow = {
  club: string;
  displayClub: string;
  family: 'wedge' | 'iron' | 'hybrid' | 'wood' | 'driver' | 'other';
  medianCarryYds: number;
  p10CarryYds: number | null;
  p90CarryYds: number | null;
  gapToNextYds: number | null;
  gapStatus: GapStatus | null;
  overlapYds: number | null;
  warning: string | null;
};

export type GappingInsight = {
  severity: 'info' | 'warning' | 'danger';
  message: string;
};

export type GappingLadder = {
  rows: GappingRow[];
  insights: GappingInsight[];
};

const keyAliases: Record<
  | 'clubType'
  | 'clubName'
  | 'clubModel'
  | 'ballSpeedMph'
  | 'launchAngleDeg'
  | 'carryYds'
  | 'totalYds'
  | 'sideYds'
  | 'spinRpm',
  string[]
> = {
  clubType: ['club type', 'clubtype', 'club'],
  clubName: ['club name'],
  clubModel: ['brand/model', 'brand model'],
  ballSpeedMph: ['ball speed', 'ball speed (mph)'],
  launchAngleDeg: ['launch angle', 'launch angle (deg)'],
  carryYds: ['carry', 'carry distance', 'carry (yds)', 'carry (yards)'],
  totalYds: ['total', 'total distance', 'total (yds)', 'total (yards)'],
  sideYds: ['side', 'side distance', 'side (yds)', 'carry deviation distance'],
  spinRpm: ['spin', 'spin rate', 'spin (rpm)']
};

const normalizeHeader = (value: string) =>
  value
    // Some CSV exports include a UTF-8 BOM or punctuation in header cells.
    // Strip those so alias mapping remains stable (e.g. "\uFEFFClub Type" -> "club type").
    .replace(/\uFEFF/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ');

const findKeyByAliases = (row: Record<string, string>, aliases: string[]) =>
  Object.keys(row).find((k) => aliases.includes(normalizeHeader(k)));

/**
 * Parses numeric strings while handling common CSV export formatting:
 * - empty strings -> null
 * - decimal commas ("1,23") -> 1.23
 * - thousands separators ("1,234.5" / "1.234,5")
 * - strips units/symbols
 */
const numeric = (value: string | undefined) => {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  let normalized = trimmed.replace(/\s/g, '');
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    // Choose decimal symbol by whichever appears last.
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    // If comma is the only separator, treat as decimal comma.
    normalized = normalized.replace(',', '.');
  }

  normalized = normalized.replace(/[^\d.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

const toNumericArray = (values: Array<number | null>) =>
  values.filter((v): v is number => typeof v === 'number');

const avg = (values: Array<number | null>) => {
  const numbers = toNumericArray(values);
  if (!numbers.length) return null;
  const total = numbers.reduce((sum, v) => sum + v, 0);
  return Math.round((total / numbers.length) * 10) / 10;
};

/**
 * Linear interpolation quantile.
 */
const quantile = (values: number[], q: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
};

const stdDev = (values: Array<number | null>) => {
  const numbers = toNumericArray(values);
  if (numbers.length < 2) return null;

  const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  const variance =
    numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (numbers.length - 1);

  return Math.round(Math.sqrt(variance) * 10) / 10;
};

const roundedQuantile = (values: Array<number | null>, q: number) => {
  const numbers = toNumericArray(values);
  const value = quantile(numbers, q);
  return value === null ? null : Math.round(value * 10) / 10;
};

const buildExpectedColumns = () =>
  Object.entries(keyAliases).map(([field, aliases]) => ({
    field,
    aliases
  }));

const getDetectedColumns = (rows: Record<string, string>[]) => {
  const known = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      known.add(normalizeHeader(key));
    }
  }
  return known;
};


const wedgeOrder = ['lob wedge', 'sand wedge', 'gap wedge', 'approach wedge', 'pitching wedge', 'wedge'];

const getClubSortKey = (clubType: string) => {
  const normalized = clubType.trim().toLowerCase();

  const wedgeIndex = wedgeOrder.indexOf(normalized);
  if (wedgeIndex >= 0) return { group: 0, rank: wedgeIndex, label: normalized };

  const ironMatch = normalized.match(/^(\d+)\s*iron$/);
  if (ironMatch) {
    const ironNumber = Number(ironMatch[1]);
    // Lower rank should render first. 9-iron before 8-iron ... before 4-iron.
    return { group: 1, rank: 10 - ironNumber, label: normalized };
  }

  const hybridMatch = normalized.match(/^(\d+)\s*hybrid$/);
  if (hybridMatch) {
    return { group: 2, rank: Number(hybridMatch[1]), label: normalized };
  }

  const woodMatch = normalized.match(/^(\d+)\s*wood$/);
  if (woodMatch) {
    return { group: 3, rank: Number(woodMatch[1]), label: normalized };
  }

  if (normalized === 'driver') {
    return { group: 4, rank: 0, label: normalized };
  }

  return { group: 5, rank: 999, label: normalized };
};

const compareClubTypeOrder = (a: string, b: string) => {
  const aKey = getClubSortKey(a);
  const bKey = getClubSortKey(b);

  if (aKey.group !== bKey.group) return aKey.group - bKey.group;
  if (aKey.rank !== bKey.rank) return aKey.rank - bKey.rank;
  return aKey.label.localeCompare(bKey.label);
};

const getClubFamily = (clubType: string): GappingRow['family'] => {
  const normalized = clubType.trim().toLowerCase();
  if (wedgeOrder.includes(normalized) || normalized.includes('wedge')) return 'wedge';
  if (/^\d+\s*iron$/.test(normalized)) return 'iron';
  if (/^\d+\s*hybrid$/.test(normalized)) return 'hybrid';
  if (/^\d+\s*wood$/.test(normalized) || normalized.includes('wood')) return 'wood';
  if (normalized === 'driver') return 'driver';
  return 'other';
};

const classifyGap = (family: GappingRow['family'], gapToNextYds: number): GapStatus => {
  if (gapToNextYds < 5) return 'overlap';

  if (family === 'wedge') {
    if (gapToNextYds > 18) return 'cliff';
    if (gapToNextYds < 8) return 'compressed';
    return 'healthy';
  }

  if (family === 'iron') {
    if (gapToNextYds > 18) return 'cliff';
    if (gapToNextYds < 8) return 'compressed';
    return 'healthy';
  }

  if (family === 'hybrid' || family === 'wood' || family === 'driver') {
    if (gapToNextYds > 20) return 'cliff';
    if (gapToNextYds < 12) return 'compressed';
    return 'healthy';
  }

  if (gapToNextYds > 18) return 'cliff';
  if (gapToNextYds < 8) return 'compressed';
  return 'healthy';
};

const buildGapWarning = (status: GapStatus, club: string, nextClub: string, gapToNextYds: number, overlapYds: number | null) => {
  if (status === 'healthy') return null;
  if (status === 'overlap') return `${club} and ${nextClub} overlap (${gapToNextYds.toFixed(1)} yds gap).`;
  if (status === 'compressed') return `${club} to ${nextClub} is compressed (${gapToNextYds.toFixed(1)} yds).`;
  if (overlapYds !== null && overlapYds > 0) {
    return `${club} to ${nextClub} has a large gap and ${overlapYds.toFixed(1)} yds of band overlap.`;
  }
  return `${club} to ${nextClub} has a large gap (${gapToNextYds.toFixed(1)} yds).`;
};

export const buildGappingLadder = (summary: SessionSummary): GappingLadder => {
  const eligibleClubs = summary.clubs
    .filter((club) => club.medianCarryYds !== null)
    .map((club) => ({
      ...club,
      medianCarryYds: club.medianCarryYds as number
    }))
    .sort((a, b) => b.medianCarryYds - a.medianCarryYds);

  const rows: GappingRow[] = [];

  for (let index = 0; index < eligibleClubs.length; index += 1) {
    const current = eligibleClubs[index];
    const next = eligibleClubs[index + 1];

    let gapToNextYds: number | null = null;
    let gapStatus: GapStatus | null = null;
    let overlapYds: number | null = null;
    let warning: string | null = null;

    if (next) {
      gapToNextYds = Math.round((current.medianCarryYds - next.medianCarryYds) * 10) / 10;

      if (current.p10CarryYds !== null && next.p90CarryYds !== null) {
        overlapYds = Math.max(0, Math.round((next.p90CarryYds - current.p10CarryYds) * 10) / 10);
      }

      gapStatus = classifyGap(getClubFamily(current.name), gapToNextYds);
      warning = buildGapWarning(gapStatus, current.displayName, next.displayName, gapToNextYds, overlapYds);
    }

    rows.push({
      club: current.name,
      displayClub: current.displayName,
      family: getClubFamily(current.name),
      medianCarryYds: current.medianCarryYds,
      p10CarryYds: current.p10CarryYds,
      p90CarryYds: current.p90CarryYds,
      gapToNextYds,
      gapStatus,
      overlapYds,
      warning
    });
  }

  const overlapCount = rows.filter((row) => row.gapStatus === 'overlap').length;
  const cliffCount = rows.filter((row) => row.gapStatus === 'cliff').length;
  const compressedCount = rows.filter((row) => row.gapStatus === 'compressed').length;

  const insights: GappingInsight[] = [];

  if (overlapCount > 0) {
    insights.push({
      severity: 'danger',
      message: `You have ${overlapCount} overlapping gap${overlapCount === 1 ? '' : 's'} in your bag.`
    });
  }

  if (cliffCount > 0) {
    insights.push({
      severity: 'danger',
      message: `You have ${cliffCount} large distance cliff${cliffCount === 1 ? '' : 's'} to address.`
    });
  }

  if (compressedCount > 0) {
    insights.push({
      severity: 'warning',
      message: `${compressedCount} gap${compressedCount === 1 ? ' is' : 's are'} compressed and may limit club separation.`
    });
  }

  if (!insights.length && rows.length > 1) {
    insights.push({ severity: 'info', message: 'Your current gapping profile looks healthy across measured clubs.' });
  }

  return { rows, insights };
};

const markCarryOutliers = (shots: ShotRecord[]) => {
  const byClub = new Map<string, ShotRecord[]>();

  for (const shot of shots) {
    const key = shot.clubType || 'Unknown';
    const list = byClub.get(key) ?? [];
    list.push(shot);
    byClub.set(key, list);
  }

  for (const clubShots of Array.from(byClub.values())) {
    const carries = clubShots
      .map((s: ShotRecord) => s.carryYds)
      .filter((v: number | null): v is number => typeof v === 'number');

    if (carries.length < 4) continue;

    const q1 = quantile(carries, 0.25);
    const q3 = quantile(carries, 0.75);
    if (q1 === null || q3 === null) continue;

    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;

    for (const shot of clubShots) {
      if (shot.carryYds === null) continue;
      if (shot.carryYds < lower || shot.carryYds > upper) {
        shot.isOutlier = true;
        shot.qualityFlags.push('carry_outlier');
      }
    }
  }
};

export const mapRowsToShots = (rows: Record<string, string>[]): ShotRecord[] => {
  const shots: ShotRecord[] = [];

  for (const row of rows) {
    const clubTypeKey = findKeyByAliases(row, keyAliases.clubType);
    const clubNameKey = findKeyByAliases(row, keyAliases.clubName);
    const clubModelKey = findKeyByAliases(row, keyAliases.clubModel);

    const clubType = row[clubTypeKey ?? '']?.trim() || 'Unknown';
    const clubName = row[clubNameKey ?? '']?.trim() || null;
    const clubModel = row[clubModelKey ?? '']?.trim() || null;

    const shot: ShotRecord = {
      clubType,
      clubName,
      clubModel,
      displayClub: clubName ? `${clubType} (${clubName})` : clubType,
      ballSpeedMph: numeric(row[findKeyByAliases(row, keyAliases.ballSpeedMph) ?? '']),
      launchAngleDeg: numeric(row[findKeyByAliases(row, keyAliases.launchAngleDeg) ?? '']),
      carryYds: numeric(row[findKeyByAliases(row, keyAliases.carryYds) ?? '']),
      totalYds: numeric(row[findKeyByAliases(row, keyAliases.totalYds) ?? '']),
      sideYds: numeric(row[findKeyByAliases(row, keyAliases.sideYds) ?? '']),
      spinRpm: numeric(row[findKeyByAliases(row, keyAliases.spinRpm) ?? '']),
      isOutlier: false,
      qualityFlags: [],
      raw: row
    };

    if (shot.clubType === 'Unknown') {
      shot.qualityFlags.push('missing_club_type');
    }

    if (shot.carryYds !== null && shot.carryYds < 0) {
      shot.qualityFlags.push('invalid_carry_distance');
    }

    const hasAnyCoreMetric =
      shot.ballSpeedMph !== null ||
      shot.launchAngleDeg !== null ||
      shot.carryYds !== null ||
      shot.totalYds !== null ||
      shot.sideYds !== null ||
      shot.spinRpm !== null;

    // Drop rows that have no reliable identity and no usable metrics.
    if (shot.clubType === 'Unknown' && !hasAnyCoreMetric) {
      continue;
    }

    shots.push(shot);
  }

  markCarryOutliers(shots);
  return shots;
};

export const buildImportReport = (rows: Record<string, string>[], shots: ShotRecord[]): ImportReport => {
  const detectedColumns = getDetectedColumns(rows);
  const expectedColumns = buildExpectedColumns();

  const columnsDetected = expectedColumns
    .filter((entry) => entry.aliases.some((alias) => detectedColumns.has(alias)))
    .map((entry) => entry.field)
    .sort();

  const columnsMissing = expectedColumns
    .filter((entry) => !entry.aliases.some((alias) => detectedColumns.has(alias)))
    .map((entry) => entry.field)
    .sort();

  const clubsDetected = Array.from(new Set(shots.map((s) => s.clubType))).sort();
  const outlierRows = shots.filter((s) => s.isOutlier).length;

  const warnings: string[] = [];
  if (columnsMissing.includes('clubType')) warnings.push('Missing canonical club type column.');
  if (columnsMissing.includes('carryYds')) warnings.push('Missing carry distance column.');
  if (columnsMissing.includes('sideYds')) warnings.push('Missing side/offline distance column for dispersion analysis.');
  if (shots.length < 10) warnings.push('Low shot count; analytics may be noisy.');
  if (!clubsDetected.length) warnings.push('No recognizable clubs detected.');

  return {
    totalRows: rows.length,
    parsedShots: shots.length,
    droppedRows: Math.max(0, rows.length - shots.length),
    outlierRows,
    columnsDetected,
    columnsMissing,
    clubsDetected,
    warnings
  };
};

export const summarizeSession = (shots: ShotRecord[]): SessionSummary => {
  const grouped = new Map<string, ShotRecord[]>();

  for (const shot of shots) {
    const key = shot.clubType || 'Unknown';
    const existing = grouped.get(key) ?? [];
    existing.push(shot);
    grouped.set(key, existing);
  }

  return {
    shots: shots.length,
    avgCarryYds: avg(shots.map((s) => s.carryYds)),
    avgBallSpeedMph: avg(shots.map((s) => s.ballSpeedMph)),
    avgLaunchAngleDeg: avg(shots.map((s) => s.launchAngleDeg)),
    avgSpinRpm: avg(shots.map((s) => s.spinRpm)),
    clubs: Array.from(grouped.entries())
      .map(([name, list]) => ({
        name,
        displayName: list.find((shot) => shot.clubName)?.displayClub ?? name,
        shotLabels: Array.from(new Set(list.map((shot) => shot.clubName).filter((v): v is string => Boolean(v)))),
        modelLabels: Array.from(new Set(list.map((shot) => shot.clubModel).filter((v): v is string => Boolean(v)))),
        shots: list.length,
        avgCarryYds: avg(list.map((s) => s.carryYds)),
        medianCarryYds: roundedQuantile(list.map((s) => s.carryYds), 0.5),
        p10CarryYds: roundedQuantile(list.map((s) => s.carryYds), 0.1),
        p90CarryYds: roundedQuantile(list.map((s) => s.carryYds), 0.9),
        carryStdDevYds: stdDev(list.map((s) => s.carryYds)),
        offlineStdDevYds: stdDev(list.map((s) => s.sideYds))
      }))
      .sort((a, b) => compareClubTypeOrder(a.name, b.name))
  };
};
