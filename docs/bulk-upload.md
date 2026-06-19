# Bulk Lead Upload — architecture & progress

## Goal
Let an admin upload very large lead files (150k+ rows, any vendor format, no
manual formatting) reliably through the admin portal.

## Why the old upload couldn't scale
The old `/admin/upload` sent the **entire file in one POST** and the server did
**full-table scans** for dedup on every upload:
- Vercel caps request bodies at ~4.5 MB — a 150k CSV (~40–50 MB) failed outright.
- The route loaded *all* existing name+phone pairs and *all* auth phrases into
  memory each call (`paginateAll`) — O(table size); at 68k→220k rows it would
  blow the 300s function limit.

## New architecture
**Client (`UploadForm.tsx`)** — parses the CSV in the browser (PapaParse),
detects tier from the filename, splits rows into chunks (`CHUNK_SIZE`), and POSTs
them to the API **sequentially with a live progress bar**. Each chunk is small,
so no body-limit or timeout issue. The full file is dropped in as-is.

**Server (`/api/admin/upload`)** — accepts a JSON chunk `{ tier, rows, finalize }`,
maps columns (unchanged fuzzy logic), and dedups **scoped to the chunk**: it
queries only that chunk's source IDs and phone numbers against the DB instead of
loading the whole table. O(chunk), constant as the table grows. `finalize: true`
on the last chunk recomputes `pricing.available_count` once.

## Constraints confirmed (June 2026)
- No unique constraint on `auth_phrase` or `source_lead_id` (probed) — so the
  global phrase scan was dropped; phrases are deduped within a request only.
- `lead_id` is unique; BLY ids are generated sequentially per chunk.

## How to use
Admin → Upload → drop the file(s). Filename must contain the source keyword
(BRONZE/COPPER/RUBY/GOLD/SILVER). Watch the per-file progress bar; it reports
rows added vs. skipped (duplicates). Multiple files upload one after another.

## Tuning
- `CHUNK_SIZE` (UploadForm.tsx) = 3000 rows/request (~1 MB body, well under limits).
- Server `maxDuration` = 60s (each chunk is small; no full-table scans).

## Progress log
- [done] shared tier helper (`src/lib/tiers.ts`).
- [done] server route rewrite — JSON chunks, scoped dedup, finalize syncs count.
- [done] client rewrite — PapaParse + chunk + sequential upload + progress bar.
- [done] build passes; verified end-to-end against the real endpoint:
  - column mapping (vendor headers → fields, junk dropped) ✓
  - chunked insert with correct reported counts (10/0, 5/5) ✓
  - dedup: source-id, cross-chunk, and name+phone ✓
  - invalid tier rejected ✓; idempotent under double-submit ✓
  - PapaParse row shape + blank-line skip + chunk boundaries ✓
  - all test rows cleaned up; `available_count` restored ✓
- [pending] real 150k upload by user, monitored live.

## "Data Leads" tier (added June 2026)
A 6th tier, **Data Leads** (filename keyword `DATA`, teal badge), was added
alongside Prime/Select/Premier/Core/Essential. Migration 004 updated the tier
CHECK on leads/orders/pricing and inserted an inactive pricing row. Verified:
DB accepts the tier, upload routes `DATA` files to it, it's hidden from agents
until `is_active` is turned on in admin Pricing. Tier appears in all 7 color
maps + the admin leads-inventory list + dashboard ordering. Set the price and
flip Active in admin → Pricing, then upload the file (filename contains DATA).

### Data Leads is a passthrough product (June 2026)
Unlike the other tiers (fixed insurance schema), Data Leads rows are stored and
delivered with their ORIGINAL columns, exactly as uploaded:
- Upload stores each row's original columns in `leads.raw_data` (jsonb) and the
  original column order in `leads.raw_columns` (text[]); only name + phone are
  mapped, purely for dedup.
- The download (`buildLeadsWorkbook`) detects `tier === 'Data Leads'` and builds
  the sheet from `raw_columns`/`raw_data` instead of the fixed columns, so agents
  receive the exact uploaded layout.
- Migrations 006 (raw_data) + 007 (raw_columns). Verified end-to-end: upload →
  store → claim → download returns identical columns in original order.
