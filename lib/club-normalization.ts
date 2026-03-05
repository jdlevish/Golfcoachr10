export const canonicalizeClubRaw = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ');

const EXACT_CLUB_MAPPINGS: Record<string, string> = {
  driver: 'D',
  dr: 'D',
  d: 'D',
  '3 wood': '3w',
  '3w': '3w',
  '5 wood': '5w',
  '5w': '5w',
  '7 wood': '7w',
  '7w': '7w',
  '2 hybrid': '2h',
  '2h': '2h',
  '3 hybrid': '3h',
  '3h': '3h',
  '4 hybrid': '4h',
  '4h': '4h',
  '5 hybrid': '5h',
  '5h': '5h',
  '2 iron': '2i',
  '2i': '2i',
  '3 iron': '3i',
  '3i': '3i',
  '4 iron': '4i',
  '4i': '4i',
  '5 iron': '5i',
  '5i': '5i',
  '6 iron': '6i',
  '6i': '6i',
  '7 iron': '7i',
  '7i': '7i',
  '8 iron': '8i',
  '8i': '8i',
  '9 iron': '9i',
  '9i': '9i',
  'pitching wedge': 'PW',
  pw: 'PW',
  'approach wedge': 'AW',
  aw: 'AW',
  'gap wedge': 'GW',
  gw: 'GW',
  'sand wedge': 'SW',
  sw: 'SW',
  'lob wedge': 'LW',
  lw: 'LW'
};

export const suggestNormalizedClubValues = () =>
  Array.from(new Set(Object.values(EXACT_CLUB_MAPPINGS))).sort((a, b) => a.localeCompare(b));

const normalizeHeuristic = (raw: string): string => {
  const cleaned = canonicalizeClubRaw(raw);
  const numberIron = cleaned.match(/^(\d+)\s*(iron|i)$/);
  if (numberIron) return `${numberIron[1]}i`;

  const numberWood = cleaned.match(/^(\d+)\s*(wood|w)$/);
  if (numberWood) return `${numberWood[1]}w`;

  const numberHybrid = cleaned.match(/^(\d+)\s*(hybrid|h|rescue)$/);
  if (numberHybrid) return `${numberHybrid[1]}h`;

  const loftOnly = cleaned.match(/^(\d{2})$/);
  if (loftOnly) {
    const loft = Number(loftOnly[1]);
    if (loft >= 40 && loft <= 64) return `${loft}\u00B0`;
  }

  if (cleaned === 'unknown') return 'Unknown';
  return raw.trim() || 'Unknown';
};

export const resolveClubNormalization = (
  raw: string,
  userAliasesByRawCanonical: Map<string, string>
): { clubRaw: string; clubNormalized: string; source: 'exact' | 'alias' | 'heuristic' } => {
  const clubRaw = raw.trim() || 'Unknown';
  const canonicalRaw = canonicalizeClubRaw(clubRaw);
  const exact = EXACT_CLUB_MAPPINGS[canonicalRaw];
  if (exact) {
    return { clubRaw, clubNormalized: exact, source: 'exact' };
  }

  const alias = userAliasesByRawCanonical.get(canonicalRaw);
  if (alias) {
    return { clubRaw, clubNormalized: alias, source: 'alias' };
  }

  return {
    clubRaw,
    clubNormalized: normalizeHeuristic(clubRaw),
    source: 'heuristic'
  };
};
