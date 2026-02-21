import { z } from 'zod';
import type { ShotRecord } from '@/lib/r10';

export type StoredShot = Omit<ShotRecord, 'raw'>;

export type StoredSessionPayload = {
  version: 1;
  shots: StoredShot[];
};

export const storedShotSchema = z.object({
  clubType: z.string(),
  clubName: z.string().nullable(),
  clubModel: z.string().nullable(),
  displayClub: z.string(),
  ballSpeedMph: z.number().nullable(),
  launchAngleDeg: z.number().nullable(),
  carryYds: z.number().nullable(),
  totalYds: z.number().nullable(),
  sideYds: z.number().nullable(),
  spinRpm: z.number().nullable(),
  isOutlier: z.boolean(),
  qualityFlags: z.array(z.string())
});

export const storedSessionPayloadSchema = z.object({
  version: z.literal(1),
  shots: z.array(storedShotSchema)
});

export const toStoredShots = (shots: ShotRecord[]): StoredShot[] =>
  shots.map(({ raw: _raw, ...rest }) => rest);

export const toShotRecords = (shots: StoredShot[]): ShotRecord[] =>
  shots.map((shot) => ({
    ...shot,
    raw: {}
  }));

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
