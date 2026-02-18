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
- Use `Club Type` as canonical club identity while preserving `Club Name` and `Brand/Model` metadata.
- Coerce locale-formatted numeric values.
- Tag carry outliers (IQR method) and let users include/exclude them.
- Show an import diagnostics panel (parsed/dropped rows, missing columns, warnings).
- Show session metrics (shot count, average carry, ball speed, launch angle, spin).
- Show per-club shot counts and average carry.
- Show per-club robust metrics: median carry, P10/P90 carry band, carry std dev, offline std dev.

## Import pipeline documentation

- See `docs/sprint1-part-a.md` for the normalization/diagnostics design.
- See `docs/sprint1-part-b.md` for per-club robust metric definitions.

## Long-term storage options

The app is currently in-browser only. For historical analytics and coaching, persistence should be added.

### Option A: SQLite (recommended first)

**Why start here**
- Very low operational overhead.
- Easy local development and prototyping.
- Great fit for single-tenant/small-team early-stage deployments.

**Suggested stack**
- Prisma + SQLite
- Tables: `users`, `sessions`, `shots`, `club_summaries`, `import_reports`

**Pros**
- Fast to implement.
- Strong relational queries for trend analytics and gapping.

**Cons**
- Horizontal scaling is limited compared with managed databases.

### Option B: MongoDB

**Why choose this**
- Flexible document schema if Garmin fields vary frequently.
- Easier sharding/managed scale for high write volume.

**Suggested model**
- `sessions` collection with nested `shots`, plus materialized aggregates.

**Pros**
- Schema flexibility.
- Good operational tooling in managed offerings.

**Cons**
- More care needed for analytical queries and consistency guarantees.

### Recommendation

Start with **SQLite + Prisma** for Sprint 1/2 speed and predictable analytics logic. Migrate to PostgreSQL or MongoDB later when usage and product requirements justify it.

## Import pipeline documentation

- See `docs/sprint1-part-a.md` for the normalization/diagnostics design.

## Long-term storage options

The app is currently in-browser only. For historical analytics and coaching, persistence should be added.

### Option A: SQLite (recommended first)

**Why start here**
- Very low operational overhead.
- Easy local development and prototyping.
- Great fit for single-tenant/small-team early-stage deployments.

**Suggested stack**
- Prisma + SQLite
- Tables: `users`, `sessions`, `shots`, `club_summaries`, `import_reports`

**Pros**
- Fast to implement.
- Strong relational queries for trend analytics and gapping.

**Cons**
- Horizontal scaling is limited compared with managed databases.

### Option B: MongoDB

**Why choose this**
- Flexible document schema if Garmin fields vary frequently.
- Easier sharding/managed scale for high write volume.

**Suggested model**
- `sessions` collection with nested `shots`, plus materialized aggregates.

**Pros**
- Schema flexibility.
- Good operational tooling in managed offerings.

**Cons**
- More care needed for analytical queries and consistency guarantees.

### Recommendation

Start with **SQLite + Prisma** for Sprint 1/2 speed and predictable analytics logic. Migrate to PostgreSQL or MongoDB later when usage and product requirements justify it.

## Next suggested steps

- Sprint 2: gapping ladder + overlap warnings + Coach v1.
- Add authenticated users and multi-session trend tracking.
