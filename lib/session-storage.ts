import { z } from 'zod';
import type { ClubDeterministicStats, ShotRecord } from '@/lib/r10';

export type StoredShot = Omit<ShotRecord, 'raw' | 'clubRaw' | 'clubNormalized'> & {
  clubRaw?: string;
  clubNormalized?: string;
};

export type StoredDerivedStats = {
  version: 1;
  computedAt: string;
  perClubStats: Record<
    string,
    Pick<
      ClubDeterministicStats,
      'count' | 'carryMedian' | 'carryStdDev' | 'offlineStdDev' | 'smashMedian' | 'faceToPathMean' | 'confidence'
    > & {
      topMissShape?: string | null;
    }
  >;
};

export type StoredSessionPayload = {
  version: number;
  sessionDate?: string;
  derivedStats?: StoredDerivedStats;
  shots: StoredShot[];
};

export const storedShotSchema = z.object({
  clubRaw: z.string().optional(),
  clubNormalized: z.string().optional(),
  clubType: z.string(),
  clubName: z.string().nullable(),
  clubModel: z.string().nullable(),
  displayClub: z.string(),
  ballSpeedMph: z.number().nullable(),
  clubSpeedMph: z.number().nullable().default(null),
  launchAngleDeg: z.number().nullable(),
  clubPathDeg: z.number().nullable().default(null),
  faceToPathDeg: z.number().nullable().default(null),
  faceAngleDeg: z.number().nullable().default(null),
  attackAngleDeg: z.number().nullable().default(null),
  launchDirectionDeg: z.number().nullable().default(null),
  spinAxisDeg: z.number().nullable().default(null),
  backspinRpm: z.number().nullable().default(null),
  sidespinRpm: z.number().nullable().default(null),
  smashFactor: z.number().nullable().default(null),
  apexFt: z.number().nullable().default(null),
  carryYds: z.number().nullable(),
  totalYds: z.number().nullable(),
  sideYds: z.number().nullable(),
  spinRpm: z.number().nullable(),
  isOutlier: z.boolean(),
  qualityFlags: z.array(z.string())
});

export const storedSessionPayloadSchema = z.object({
  version: z.number().int().positive(),
  sessionDate: z.string().datetime().optional(),
  derivedStats: z
    .object({
      version: z.literal(1),
      computedAt: z.string().datetime(),
      perClubStats: z.record(
        z.object({
          count: z.number().int().nonnegative(),
          carryMedian: z.number().nullable(),
          carryStdDev: z.number().nullable(),
          offlineStdDev: z.number().nullable(),
          smashMedian: z.number().nullable(),
          faceToPathMean: z.number().nullable(),
          confidence: z.enum(['High', 'Medium', 'Low']),
          topMissShape: z.string().nullable().optional()
        })
      )
    })
    .optional(),
  shots: z.array(storedShotSchema)
});

export const toStoredShots = (shots: ShotRecord[]): StoredShot[] =>
  shots.map(({ raw: _raw, ...rest }) => rest);

export const toShotRecords = (shots: StoredShot[]): ShotRecord[] =>
  shots.map((shot) => {
    const clubRaw = shot.clubRaw?.trim() || shot.clubType || 'Unknown';
    const clubNormalized = shot.clubNormalized?.trim() || shot.clubType || 'Unknown';
    return {
      ...shot,
      clubRaw,
      clubNormalized,
      clubType: clubNormalized,
      displayClub: shot.clubName ? `${clubNormalized} (${shot.clubName})` : clubNormalized,
      raw: {}
    };
  });

export const parseStoredSessionPayload = (notes: string | null): StoredSessionPayload | null => {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    const validated = storedSessionPayloadSchema.safeParse(parsed);
    if (!validated.success) return null;
    return validated.data;
  } catch {
    return null;
  }
};
