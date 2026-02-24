# Coach v2 Phase 1

This phase introduces a deterministic Coach v2 layer and keeps Coach v1 responses available for backward compatibility.

## What was added

- New Coach v2 domain contract in `types/coach.ts`
- New deterministic Coach v2 engine in `lib/coach-v2.ts`
- API payload extension:
  - `GET /api/sessions/all-time` now returns `coachV2Plan`
  - `GET /api/sessions/[sessionId]` now returns `coachV2Plan`
- Deterministic trend + insight extension:
  - `trendDeltas` (latest session vs baseline)
  - `ruleInsights` (if-then coaching insights)
- Dashboard rendering updates for Coach v2 in:
  - `components/csv-uploader.tsx`
  - `components/session-history.tsx`

## Coach v2 output model

`CoachV2Plan` includes:

- all `constraintScores` (sorted high-to-low)
- Primary and secondary constraint scores
- Confidence score and confidence level
- Deterministic practice plan (duration, goal, steps)
- Trend summary text generated from deterministic values

## Constraint families

- Direction consistency
- Distance control
- Bag gapping
- Strike quality (proxy signal until smash-factor data is available)

## Confidence model

Confidence score is deterministic and based on:

- Number of shots analyzed
- Number of clubs analyzed
- Number of sessions included
- Signal coverage across constraint families

## Backward compatibility

Coach v1 (`coachPlan`) remains in API responses and existing callers are not broken.

## Next Phase 1 targets

- Add persistence models for coach memory and drill history

## Trend delta contract

`trendDeltas` includes:

- baseline availability and number of sessions in baseline
- metric deltas for:
  - average carry
  - average ball speed
  - gap alerts
- direction flag per metric (`improved`, `worsened`, `flat`, `insufficient`)
- human-readable deterministic summary line

## If-then rule insights

Current deterministic rules:

- Speed-carry link (`if speed stays up, carry improves`)
- Late-session dispersion spike (`if session runs long, offline spread increases`)
- Top-club direction limiter (`if start-line improves on top-volume club, dispersion cost drops`)
- Bag spacing risk (`if severe gap alerts persist, club selection variance stays high`)

If no rule is triggered, an info insight is returned to drive baseline-building behavior.

Rule thresholds are centralized in `lib/analysis.ts` with explicit minimum sample gates so they can be tuned without changing API/UI contracts.
