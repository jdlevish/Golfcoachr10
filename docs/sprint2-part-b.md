# Sprint 2 Part B: Coach v1 (Primary Limiter + Action Plan)

Sprint 2 Part B introduces a Coach v1 recommendation layer built from session and gapping outputs.

## What Coach v1 does

- Selects one primary limiter for the session:
  - direction consistency
  - distance control
  - bag gapping
- Produces:
  - a plain-language explanation
  - one measurable target for next session
  - a 3-step practice plan

## Inputs used

- Per-club carry and offline consistency metrics from Sprint 1B
- Gapping status counts from Sprint 2A (`overlap`, `compressed`, `cliff`)

## Selection logic (high level)

- If gapping alerts are dominant, prioritize `bag_gapping`
- Otherwise compare:
  - worst offline std dev club (direction)
  - worst carry std dev club (distance)
- Use the stronger signal as the primary limiter

## Why this design

Coach v1 intentionally stays simple and deterministic so users can trust recommendations and compare sessions consistently.

## Next target

- Add confidence scoring and richer drill personalization
- Incorporate strike metrics (smash factor) when reliably available
