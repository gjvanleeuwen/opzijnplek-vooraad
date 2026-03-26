import { db } from '$lib/server/db';
import { settings, watermark, syncRuns, syncWarnings } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import type {
	SyncRunRecord,
	SyncStatus,
	TriggerSource,
	SkuResult,
	SyncWarning,
	VerificationResult
} from '$lib/types';

// ── Settings ─────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
	const row = db.select().from(settings).where(eq(settings.key, key)).get();
	return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
	const exists = db.select().from(settings).where(eq(settings.key, key)).get();
	if (exists) {
		db.update(settings)
			.set({ value, updatedAt: new Date().toISOString() })
			.where(eq(settings.key, key))
			.run();
	} else {
		db.insert(settings)
			.values({ key, value, updatedAt: new Date().toISOString() })
			.run();
	}
}

// ── Watermark ────────────────────────────────────────────────────────

export function getWatermark(): number {
	const row = db.select().from(watermark).where(eq(watermark.id, 1)).get();
	if (!row) {
		db.insert(watermark).values({ id: 1, lastInventoryLogId: 0 }).run();
		return 0;
	}
	return row.lastInventoryLogId;
}

export function setWatermark(lastInventoryLogId: number): void {
	const exists = db.select().from(watermark).where(eq(watermark.id, 1)).get();
	if (exists) {
		db.update(watermark)
			.set({ lastInventoryLogId, updatedAt: new Date().toISOString() })
			.where(eq(watermark.id, 1))
			.run();
	} else {
		db.insert(watermark)
			.values({ id: 1, lastInventoryLogId, updatedAt: new Date().toISOString() })
			.run();
	}
}

// ── Sync Runs ────────────────────────────────────────────────────────

export function createSyncRun(triggeredBy: TriggerSource): SyncRunRecord {
	const now = new Date().toISOString();
	const result = db
		.insert(syncRuns)
		.values({
			status: 'running',
			triggeredBy,
			startedAt: now
		})
		.returning()
		.get();

	return rowToRecord(result);
}

export function updateSyncRun(
	id: number,
	data: {
		status?: SyncStatus;
		logsProcessed?: number;
		skusUpdated?: number;
		skusSkipped?: number;
		skusFailed?: number;
		watermarkBefore?: number;
		watermarkAfter?: number;
		log?: SkuResult[];
		verification?: VerificationResult;
		saleIds?: string[];
		error?: string | null;
		finishedAt?: string;
	}
): void {
	const { log, verification, saleIds, ...rest } = data;
	db.update(syncRuns)
		.set({
			...rest,
			...(log !== undefined ? { log: JSON.stringify(log) } : {}),
			...(verification !== undefined ? { verification: JSON.stringify(verification) } : {}),
			...(saleIds !== undefined ? { saleIds: JSON.stringify(saleIds) } : {})
		})
		.where(eq(syncRuns.id, id))
		.run();
}

export function getRecentRuns(limit = 20): SyncRunRecord[] {
	const rows = db.select().from(syncRuns).orderBy(desc(syncRuns.id)).limit(limit).all();
	return rows.map(rowToRecord);
}

export function getRun(id: number): SyncRunRecord | null {
	const row = db.select().from(syncRuns).where(eq(syncRuns.id, id)).get();
	return row ? rowToRecord(row) : null;
}

export function hasRunningSync(): boolean {
	const row = db.select().from(syncRuns).where(eq(syncRuns.status, 'running')).get();
	return !!row;
}

// ── Warnings ────────────────────────────────────────────────────────

export function insertWarnings(warnings: Omit<SyncWarning, 'id' | 'acknowledged'>[]): void {
	for (const w of warnings) {
		db.insert(syncWarnings)
			.values({
				syncRunId: w.syncRunId,
				sku: w.sku,
				ecomVariantId: w.ecomVariantId,
				type: w.type,
				message: w.message,
				expected: w.expected,
				actual: w.actual,
				createdAt: w.createdAt
			})
			.run();
	}
}

export function getWarningsForRun(syncRunId: number): SyncWarning[] {
	return db
		.select()
		.from(syncWarnings)
		.where(eq(syncWarnings.syncRunId, syncRunId))
		.all() as SyncWarning[];
}

export function getUnacknowledgedWarnings(): SyncWarning[] {
	return db
		.select()
		.from(syncWarnings)
		.where(eq(syncWarnings.acknowledged, false))
		.orderBy(desc(syncWarnings.id))
		.all() as SyncWarning[];
}

export function acknowledgeWarning(id: number): void {
	db.update(syncWarnings)
		.set({ acknowledged: true })
		.where(eq(syncWarnings.id, id))
		.run();
}

// ── Helpers ──────────────────────────────────────────────────────────

function rowToRecord(row: typeof syncRuns.$inferSelect): SyncRunRecord {
	return {
		id: row.id,
		status: row.status as SyncStatus,
		triggeredBy: row.triggeredBy as TriggerSource,
		logsProcessed: row.logsProcessed,
		skusUpdated: row.skusUpdated,
		skusSkipped: row.skusSkipped,
		skusFailed: row.skusFailed,
		watermarkBefore: row.watermarkBefore,
		watermarkAfter: row.watermarkAfter,
		log: row.log ? JSON.parse(row.log) : [],
		error: row.error,
		startedAt: row.startedAt,
		finishedAt: row.finishedAt,
		verification: row.verification ? JSON.parse(row.verification) : null,
		saleIds: row.saleIds ? JSON.parse(row.saleIds) : []
	};
}
