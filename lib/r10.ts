export type ShotRecord = {
  club: string;
  ballSpeedMph: number | null;
  launchAngleDeg: number | null;
  carryYds: number | null;
  totalYds: number | null;
  sideYds: number | null;
  spinRpm: number | null;
  raw: Record<string, string>;
};

export type SessionSummary = {
  shots: number;
  avgCarryYds: number | null;
  avgBallSpeedMph: number | null;
  avgLaunchAngleDeg: number | null;
  avgSpinRpm: number | null;
  clubs: { name: string; shots: number; avgCarryYds: number | null }[];
};

const keyAliases: Record<keyof Omit<ShotRecord, 'raw'>, string[]> = {
  club: ['club', 'club type'],
  ballSpeedMph: ['ball speed', 'ball speed (mph)'],
  launchAngleDeg: ['launch angle', 'launch angle (deg)'],
  carryYds: ['carry', 'carry distance', 'carry (yds)', 'carry (yards)'],
  totalYds: ['total', 'total distance', 'total (yds)', 'total (yards)'],
  sideYds: ['side', 'side distance', 'side (yds)'],
  spinRpm: ['spin', 'spin rate', 'spin (rpm)']
};

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ');

const numeric = (value: string | undefined) => {
  if (!value) return null;
  const n = Number(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const avg = (values: Array<number | null>) => {
  const numbers = values.filter((v): v is number => typeof v === 'number');
  if (!numbers.length) return null;
  const total = numbers.reduce((sum, v) => sum + v, 0);
  return Math.round((total / numbers.length) * 10) / 10;
};

const resolveValue = (
  row: Record<string, string>,
  aliases: string[],
  transform: (v: string | undefined) => string | number | null
) => {
  const key = Object.keys(row).find((k) => aliases.includes(normalizeHeader(k)));
  return transform(key ? row[key] : undefined);
};

export const mapRowsToShots = (rows: Record<string, string>[]): ShotRecord[] => {
  return rows
    .map((row) => {
      const shot: ShotRecord = {
        club: String(resolveValue(row, keyAliases.club, (v) => v?.trim() ?? 'Unknown')),
        ballSpeedMph: resolveValue(row, keyAliases.ballSpeedMph, numeric) as number | null,
        launchAngleDeg: resolveValue(row, keyAliases.launchAngleDeg, numeric) as number | null,
        carryYds: resolveValue(row, keyAliases.carryYds, numeric) as number | null,
        totalYds: resolveValue(row, keyAliases.totalYds, numeric) as number | null,
        sideYds: resolveValue(row, keyAliases.sideYds, numeric) as number | null,
        spinRpm: resolveValue(row, keyAliases.spinRpm, numeric) as number | null,
        raw: row
      };

      return shot;
    })
    .filter((shot) =>
      [
        shot.club !== 'Unknown',
        shot.ballSpeedMph !== null,
        shot.launchAngleDeg !== null,
        shot.carryYds !== null,
        shot.totalYds !== null,
        shot.sideYds !== null,
        shot.spinRpm !== null
      ].some(Boolean));
};

export const summarizeSession = (shots: ShotRecord[]): SessionSummary => {
  const grouped = new Map<string, ShotRecord[]>();

  for (const shot of shots) {
    const key = shot.club || 'Unknown';
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
        shots: list.length,
        avgCarryYds: avg(list.map((s) => s.carryYds))
      }))
      .sort((a, b) => b.shots - a.shots)
  };
};
