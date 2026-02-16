# Golfcoachr10 starter

A lightweight Next.js starter to ingest Garmin R10 exported CSV files, normalize known columns, and show quick session-level summaries.

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Current capabilities

- Upload a CSV file in-browser.
- Parse rows with flexible header aliases (for common Garmin export naming variants).
- Show session metrics (shot count, average carry, ball speed, launch angle, spin).
- Show per-club shot counts and average carry.

## Next suggested steps

- Persist uploads and computed metrics in a database.
- Add shot dispersion visuals and rolling averages.
- Support user accounts and historical session comparisons.
