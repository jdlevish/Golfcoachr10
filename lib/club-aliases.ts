import { prisma } from '@/lib/prisma';
import { canonicalizeClubRaw } from '@/lib/club-normalization';
import { Prisma } from '@prisma/client';

export async function getUserClubAliasMap(userId: string): Promise<Map<string, string>> {
  let aliases: Array<{ raw: string; normalized: string }> = [];
  try {
    aliases = await prisma.clubAlias.findMany({
      where: { userId },
      select: {
        raw: true,
        normalized: true
      }
    });
  } catch (error) {
    // Allow session ingestion to proceed when ClubAlias table is not yet migrated.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022')
    ) {
      return new Map();
    }
    throw error;
  }

  return new Map(
    aliases
      .map((alias) => [canonicalizeClubRaw(alias.raw), alias.normalized.trim()] as const)
      .filter((entry: readonly [string, string]) => entry[0].length > 0 && entry[1].length > 0)
  );
}
