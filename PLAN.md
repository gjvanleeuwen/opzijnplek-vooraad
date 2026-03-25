# OpZijnPlek — Lightspeed Inventory Sync Plan

> Syncs inventory changes from **Lightspeed R-Series Retail POS** to **Lightspeed eCom C-Series** (webshopapp).
> eCom is the source of truth. R-Series sales/returns decrement/increment eCom stock.
> The two systems are completely separate — no omnichannel link exists.

---

## Phase 0 — Project Reconfiguration

The SvelteKit scaffold already exists with Drizzle, better-auth, Tailwind, and Postgres.
We need to adapt it for this project's needs.

### 0.1 Switch Drizzle from Postgres to SQLite
- [ ] Install `better-sqlite3` and `@types/better-sqlite3` (or use `drizzle-orm/bun-sqlite`)
- [ ] Update `drizzle.config.ts`: change dialect to `sqlite`, point at `./data/opzijnplek.db`
- [ ] Update `src/lib/server/db/index.ts`: use SQLite driver instead of postgres
- [ ] Update `.env.example` and `.env`: replace `DATABASE_URL` with `DATABASE_PATH=./data/opzijnplek.db`
- [ ] Update `compose.yaml`: remove Postgres service, add volume mount for `./data`
- [ ] Create `data/` directory, add to `.gitignore`

### 0.2 Update `.env.example` with Lightspeed credentials
```
# Lightspeed R-Series (Retail POS)
LS_RETAIL_ACCOUNT_ID=
LS_RETAIL_CLIENT_ID=
LS_RETAIL_CLIENT_SECRET=
LS_RETAIL_REFRESH_TOKEN=

# Lightspeed eCom C-Series (webshopapp)
LS_ECOM_API_KEY=
LS_ECOM_API_SECRET=
LS_ECOM_LANGUAGE=nl

# Database
DATABASE_PATH=./data/opzijnplek.db
```

### 0.3 Clean up scaffold
- [ ] Remove demo routes (`src/routes/demo/`)
- [ ] Remove vitest example files (`src/lib/vitest-examples/`)
- [ ] Keep better-auth wiring for later (password-protect dashboard)
- [ ] Keep Tailwind (dashboard UI)

---

## Phase 1 — Types & Database Schema

### 1.1 `src/lib/types.ts` — Shared interfaces
- `InventoryLogEntry` — R-Series inventory log record
- `RSeriesItem` — R-Series item (SKU resolution)
- `EcomVariant` — eCom variant (stock target)
- `SkuResult` — per-SKU sync result for logging
- `SyncRunRecord` — full sync run record
- `SyncStatus` — union type: `'running' | 'success' | 'partial' | 'failed'`
- `TriggerSource` — union type: `'schedule' | 'manual'`

### 1.2 `src/lib/server/db/schema.ts` — Drizzle SQLite schema
```sql
watermark: id (int PK default 1), last_inventory_log_id (int default 0), updated_at (text)
sync_runs: id (int PK autoincrement), status, triggered_by, logs_processed,
           skus_updated, skus_skipped, skus_failed, watermark_before, watermark_after,
           log (text/JSON), error, started_at, finished_at
```

### 1.3 `src/lib/server/store.ts` — Persistence helpers
- `getWatermark(): number`
- `setWatermark(id: number): void`
- `createSyncRun(triggeredBy): SyncRunRecord`
- `updateSyncRun(id, partial): void`
- `getRecentRuns(limit=20): SyncRunRecord[]`
- `getRun(id): SyncRunRecord | null`

---

## Phase 2 — API Clients

### 2.1 `src/lib/server/retail.ts` — R-Series API client
- **Token management**
  - Store `accessToken` + `expiresAt` in module-level variable (memory cache)
  - `getAccessToken()`: if expired or within 60s of expiry, refresh via
    `POST https://cloud.merchantos.com/oauth/access_token.php`
    with `client_id`, `client_secret`, `refresh_token`, `grant_type=refresh_token`
  - Return cached token otherwise
- **Rate limiting**
  - Track last request timestamp, enforce minimum 500ms between calls
  - Helper: `await rateLimit()` before each fetch
- **Core methods**
  - `fetchInventoryLogs(sinceLogId: number): InventoryLogEntry[]`
    - `GET /InventoryLog.json?inventoryLogID=>{sinceLogId}&orderby=inventoryLogID&orderby_desc=false&limit=100`
    - Paginate if needed (check if 100 results returned, fetch next page)
    - Normalize single-result dict to array
    - Filter to `reason` in `['AdjustmentForSale', 'ReturnForSale']`
  - `fetchItem(itemId: string): RSeriesItem`
    - `GET /Item/{itemId}.json`
    - Extract `customSku`, `systemSku`, `upc`, `ean`

### 2.2 `src/lib/server/ecom.ts` — eCom C-Series API client
- **Auth**: HTTP Basic with `LS_ECOM_API_KEY:LS_ECOM_API_SECRET`
- **Rate limiting**: same 500ms delay pattern
- **Core methods**
  - `findVariantBySku(sku: string): EcomVariant | null`
    - Try `GET /variants.json?sku={sku}&limit=1`
    - Fallback: `?ean={sku}&limit=1`
    - Fallback: `?articleCode={sku}&limit=1`
    - Return null if no match found
  - `getVariant(id: number): EcomVariant`
    - `GET /variants/{id}.json`
  - `updateStockLevel(variantId: number, newLevel: number): void`
    - `PUT /variants/{variantId}.json` with body `{ variant: { stockLevel: newLevel } }`

---

## Phase 3 — Sync Orchestration

### 3.1 `src/lib/server/sync.ts`
```
runSync(triggeredBy: TriggerSource): SyncRunRecord
```

**Algorithm:**
1. Create SyncRun record (status=running)
2. Load watermark
3. Fetch all inventory logs since watermark (paginated)
4. If no logs → mark success, return early
5. For each log: resolve itemID → SKU via retail.fetchItem (with in-memory cache)
6. Aggregate: group by SKU, sum `qohChange` per SKU
7. For each SKU with net change != 0:
   a. Find eCom variant by SKU/EAN
   b. If not found → log as skipped, continue
   c. GET current stockLevel
   d. Compute: `newStock = Math.max(0, currentStock + netChange)`
   e. If newStock === currentStock → skip (no-op)
   f. PUT new stockLevel
   g. Log result (sku, before, delta, after)
8. Determine status:
   - All succeeded → `success`
   - Some failed → `partial`
   - All failed → `failed`
9. Advance watermark ONLY if zero hard failures (status != `failed`)
10. Update SyncRun record with final stats
11. Return the SyncRun

**Error handling:**
- Individual SKU failures don't abort the run — collect errors, continue
- Network/auth failures on the R-Series fetch → abort entire run, don't advance watermark
- Wrap each eCom update in try/catch, record per-SKU error

---

## Phase 4 — API Routes

### 4.1 `src/routes/api/sync/+server.ts`
- `POST` — trigger sync manually
  - Call `runSync('manual')`
  - Return JSON response with run summary
  - Guard against concurrent runs (check if a run is already `running`)

### 4.2 `src/routes/api/status/+server.ts`
- `GET` — return last 20 sync runs
  - Call `getRecentRuns(20)`

### 4.3 `src/routes/api/runs/[id]/+server.ts`
- `GET` — return full detail for a single run
  - Call `getRun(id)`
  - 404 if not found

---

## Phase 5 — Dashboard UI

### 5.1 `src/routes/+page.svelte`
- **Header**: app name, last sync status badge + timestamp
- **Sync button**: "Run sync now" → POST `/api/sync`, show spinner, refresh on complete
- **Runs table**: last 20 runs with columns:
  - Status (color-coded badge)
  - Triggered by
  - SKUs updated / skipped / failed
  - Watermark range (before → after)
  - Duration
  - Expandable row detail
- **Run detail panel**: per-SKU breakdown
  - SKU, eCom variant ID, stock before → delta → stock after, status

### 5.2 `src/routes/+page.server.ts`
- `load()` → fetch recent runs from DB (server-side, no API call needed)

---

## Phase 6 — Scheduling

### 6.1 Option A: External cron (recommended for production)
- Dokploy/Docker cron job: `curl -X POST http://localhost:3000/api/sync`
- Every 5 minutes or configurable interval

### 6.2 Option B: In-process scheduler
- `node-cron` in `src/hooks.server.ts` — runs sync on interval during dev
- Environment variable `SYNC_CRON_ENABLED=true` + `SYNC_CRON_INTERVAL=*/5 * * * *`
- Only active in non-test environments

---

## Phase 7 — Docker & Deployment

### 7.1 `Dockerfile`
- Multi-stage: build with bun, run with node (or bun)
- Copy built output + `data/` volume mount point
- Expose port 3000

### 7.2 `compose.yaml` (updated)
- Single service: SvelteKit app
- Volume mount: `./data:/app/data` for SQLite persistence
- Environment: load from `.env`
- Port: 3000

### 7.3 Dokploy deployment
- Simple Dokploy password-protect on the dashboard if no auth needed
- If auth needed later: better-auth is already wired in the scaffold

---

## Phase 8 — Hardening & Polish

### 8.1 Concurrency guard
- Prevent overlapping sync runs (check for `status=running` before starting)

### 8.2 Retry logic
- Failed runs: next scheduled run replays from same watermark (built-in via cursor design)
- No explicit retry needed — idempotent by design

### 8.3 Monitoring
- Log sync results to stdout (structured JSON for Dokploy logs)
- Dashboard shows failures visually

### 8.4 Tests
- Unit tests for aggregation logic (aggregate qohChange per SKU)
- Unit tests for watermark advancement rules
- Integration test mocking both APIs end-to-end

---

## Dependency Summary

**Add:**
- `better-sqlite3` + `@types/better-sqlite3` (SQLite driver)
- `drizzle-orm` already present — switch to SQLite dialect
- `node-cron` + `@types/node-cron` (optional, for in-process scheduling)

**Remove (later, not now):**
- `postgres` package (once fully switched to SQLite)

**Keep:**
- `better-auth` (for optional dashboard auth)
- `tailwindcss` (dashboard UI)
- `drizzle-kit` (migrations)
- `vitest` (testing)

---

## Build Order

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8
  setup     types     clients   sync      routes    UI        cron      docker    polish
```

Each phase is independently testable. Phase 2 (API clients) is the first milestone
where we can verify real API connectivity with both Lightspeed systems.
