# Sprint 1 Part B: Per-Club Robust Metrics

Sprint 1 Part B adds practical consistency metrics to each club summary.

## Metrics now computed per club

- `medianCarryYds` (robust central tendency)
- `p10CarryYds` and `p90CarryYds` (performance band)
- `carryStdDevYds` (distance consistency)
- `offlineStdDevYds` (directional consistency from side/offline distance)
- Existing `avgCarryYds` is retained for continuity.

## Why these were prioritized

Average carry alone can hide inconsistency. Median and percentile bands make it much clearer how playable a club is in real practice sessions.

## Interaction with outliers

The existing outlier toggle controls whether outlier-tagged shots are included in these metrics. This allows users to compare:

- practice truth with all swings included
- “typical” baseline with clear outliers excluded

## Known limitations

- No visual dispersion plot yet (planned next)
- No confidence scoring per metric yet
- No minimum-shot threshold in UI for warning badges yet

## Next target

- Add per-club visualizations (scatter + histogram)
- Add gapping ladder using median + P10/P90 bands
