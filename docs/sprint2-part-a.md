# Sprint 2 Part A: Gapping Ladder and Gap Health Warnings

Sprint 2 Part A adds a carry-based gapping ladder so users can diagnose bag spacing issues from a single session.

## What was added

- `buildGappingLadder(summary)` utility in `lib/r10.ts`
- Ladder rows sorted by median carry descending
- Adjacent gap computation and health classification
- Gap status badges in UI:
  - `healthy`
  - `compressed`
  - `overlap`
  - `cliff`
- Auto-generated gapping insights summary

## Classification rules

- Overlap: gap < 5 yds
- Irons/Wedges:
  - compressed < 8 yds
  - healthy 8 to threshold
  - cliff > 18 yds
- Hybrids/Woods/Driver:
  - compressed < 12 yds
  - healthy 12 to 20 yds
  - cliff > 20 yds

## Notes

- The ladder uses `medianCarryYds` to improve robustness.
- P10/P90 bands are displayed for context.
- Outlier toggle from Sprint 1 still applies before ladder construction.

## Next target (Sprint 2 Part B)

- Coach v1 top-limiter selection and actionable practice plan output.
