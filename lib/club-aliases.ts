import { prisma } from '@/lib/prisma';
import { canonicalizeClubRaw } from '@/lib/club-normalization';

export async function getUserClubAliasMap(userId: string): Promise<Map<string, string>> {
  const aliases = await prisma.clubAlias.findMany({
    where: { userId },
    select: {
      raw: true,
      normalized: true
    }
  });

  return new Map(
    aliases
      .map((alias: { raw: string; normalized: string }) => [canonicalizeClubRaw(alias.raw), alias.normalized.trim()] as const)
      .filter((entry: readonly [string, string]) => entry[0].length > 0 && entry[1].length > 0)
  );
}
