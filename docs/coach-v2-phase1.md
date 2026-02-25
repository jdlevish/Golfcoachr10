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
- Coach memory persistence models:
  - `CoachProfile`
  - `SessionAnalysis`
  - `DrillLog`
- Coach memory APIs:
  - `GET/PUT /api/coach/profile`
  - `GET/POST /api/coach/drills`
  - `POST /api/coach/analysis/[sessionId]`
- Scoped summary API:
  - `POST /api/coach/summary/[sessionId]`
  - Uses deterministic metrics/context as source of truth and optionally calls OpenAI when configured.

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
  - completed

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
- Drill memory signal (`if prior drills for this constraint scored well, repeat them first`)

If no rule is triggered, an info insight is returned to drive baseline-building behavior.

Rule thresholds are centralized in `lib/analysis.ts` with explicit minimum sample gates so they can be tuned without changing API/UI contracts.

## LLM summary guardrails

- LLM usage is optional and gated by `OPENAI_API_KEY`.
- If OpenAI is not configured or returns an invalid/failed response, the endpoint returns a deterministic summary.
- Prompt payload is scoped to structured deterministic fields:
  - coach constraints and confidence
  - trend deltas summary
  - top deterministic if-then insights

## YouTube drill recommendations

- `POST /api/coach/summary/[sessionId]` now returns:
  - `summary`
  - `recommendedDrills[]` (`name`, `youtubeUrl`, `why`)
  - `drillRecommendationsLogged` (count inserted into drill memory)
- Recommended drills are automatically persisted into `DrillLog` with:
  - `videoUrl`
  - `recommendationSource = "ai_summary"`
- Duplicate recommendations for the same session are de-duplicated by `drillName + videoUrl`.
