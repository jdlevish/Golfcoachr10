# Sprint 1 Part A: Import Normalization and Diagnostics

This document explains the import pipeline introduced in Sprint 1 Part A.

## Goals

- Normalize Garmin CSV exports with resilient header mapping.
- Keep `Club Type` as canonical identity for grouping.
- Preserve `Club Name` and `Brand/Model` as optional metadata.
- Produce an import report so users can trust what was parsed.
- Tag outliers rather than deleting them.

## Pipeline

1. Parse CSV rows in-browser with PapaParse.
2. Normalize key headers using alias mapping in `lib/r10.ts`.
3. Coerce numbers with locale support (`1,23`, `1.234,5`, `1,234.5`).
4. Attach row-level quality flags (e.g., missing club type, invalid carry distance).
5. Mark carry outliers per club using IQR bounds.
6. Build an `ImportReport` with detected/missing columns and warnings.
7. Render diagnostics before summary analytics.

## Why diagnostics matter

Many Garmin exports vary by settings, locale, and firmware. The diagnostics panel makes parsing transparent:

- How many rows were usable vs dropped.
- Which analytics columns were actually detected.
- Whether key metrics (carry/offline) are unavailable.
- How many potential outlier shots are influencing results.

## Outlier approach

Outliers are tagged (not deleted). Users can include/exclude them in summary calculations.

- Method: IQR fence per `clubType` on carry distance
- Boundaries: `[Q1 - 1.5*IQR, Q3 + 1.5*IQR]`
- Minimum samples to evaluate: 4 shots per club

## Data model notes

- `clubType`: canonical key (stable Garmin field)
- `clubName`: optional user label
- `clubModel`: optional metadata
- `displayClub`: UI display label (`clubType` with optional alias)

## Next in Sprint 1 Part B

- Add median carry and P10/P90 per club
- Add dispersion/consistency metrics
- Add charting and outlier toggles at the club-detail level
