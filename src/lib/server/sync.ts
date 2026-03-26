import { fetchInventoryLogs, fetchItem } from '$lib/server/retail';
import { findVariantBySku, getVariant, updateStockLevel } from '$lib/server/ecom';
import {
	getWatermark,
	setWatermark,
	createSyncRun,
	updateSyncRun,
	hasRunningSync,
	insertWarnings
} from '$lib/server/store';
import type {
	SkuResult,
	TriggerSource,
	SyncRunRecord,
	SyncWarning,
	VerificationResult,
	InventoryLogEntry,
	RSeriesItem
} from '$lib/types';
import { SALE_REASONS } from '$lib/types';

// ── Item cache (per sync run) ───────────────────────────────────────

const itemCache = new Map<string, RSeriesItem>();

async function resolveItem(itemId: string): Promise<RSeriesItem> {
	const cached = itemCache.get(itemId);
	if (cached) return cached;
	const item = await fetchItem(itemId);
	itemCache.set(itemId, item);
	return item;
}

function skuFromItem(item: RSeriesItem): string {
	return item.customSku || item.systemSku || item.ean || item.upc || '';
}

// ── Aggregation ─────────────────────────────────────────────────────

export interface LogDetail {
	inventoryLogID: string;
	reason: string;
	qohChange: number;
	saleID?: string;
	createTime: string;
}

interface AggregatedSku {
	sku: string;
	netDelta: number;
	itemId: string;
	logs: LogDetail[];
}

async function aggregateLogs(
	logs: InventoryLogEntry[]
): Promise<{ aggregated: AggregatedSku[]; skipped: SkuResult[]; highestLogId: number }> {
	const skuDeltas = new Map<string, { netDelta: number; itemId: string; logs: LogDetail[] }>();
	const skipped: SkuResult[] = [];
	let highestLogId = 0;

	for (const entry of logs) {
		const logId = parseInt(entry.inventoryLogID);
		if (logId > highestLogId) highestLogId = logId;

		// Filter: only sale-related reasons
		if (!SALE_REASONS.includes(entry.reason as (typeof SALE_REASONS)[number])) {
			continue;
		}

		const delta = parseInt(entry.qohChange);

		try {
			const item = await resolveItem(entry.itemID);
			const sku = skuFromItem(item);

			if (!sku) {
				skipped.push({
					sku: `item:${entry.itemID}`,
					ecomVariantId: null,
					stockBefore: null,
					delta,
					stockAfter: null,
					status: 'skipped',
					error: 'No SKU/EAN found on R-Series item'
				});
				continue;
			}

			const logDetail: LogDetail = {
				inventoryLogID: entry.inventoryLogID,
				reason: entry.reason,
				qohChange: delta,
				saleID: entry.saleID,
				createTime: entry.createTime
			};

			const existing = skuDeltas.get(sku);
			if (existing) {
				existing.netDelta += delta;
				existing.logs.push(logDetail);
			} else {
				skuDeltas.set(sku, { netDelta: delta, itemId: entry.itemID, logs: [logDetail] });
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			skipped.push({
				sku: `item:${entry.itemID}`,
				ecomVariantId: null,
				stockBefore: null,
				delta,
				stockAfter: null,
				status: 'failed',
				error: `Failed to resolve item: ${message}`
			});
		}
	}

	// Filter out net-zero changes
	const aggregated: AggregatedSku[] = [];
	for (const [sku, { netDelta, itemId, logs: skuLogs }] of skuDeltas) {
		if (netDelta !== 0) {
			aggregated.push({ sku, netDelta, itemId, logs: skuLogs });
		}
	}

	return { aggregated, skipped, highestLogId };
}

// ── Preview (dry run) ───────────────────────────────────────────────

export interface PreviewChange extends SkuResult {
	logs: LogDetail[];
}

export interface PreviewResult {
	logsFound: number;
	saleLogsFound: number;
	reasonCounts: Record<string, number>;
	changes: PreviewChange[];
	skipped: SkuResult[];
	watermarkBefore: number;
	wouldAdvanceTo: number;
}

export async function previewSync(filterSku?: string): Promise<PreviewResult> {
	const watermarkBefore = getWatermark();
	const logs = await fetchInventoryLogs(watermarkBefore);

	const { aggregated, skipped, highestLogId } = await aggregateLogs(logs);

	const reasonCounts: Record<string, number> = {};
	let saleLogsCount = 0;
	for (const l of logs) {
		reasonCounts[l.reason] = (reasonCounts[l.reason] || 0) + 1;
		if (SALE_REASONS.includes(l.reason as (typeof SALE_REASONS)[number])) saleLogsCount++;
	}

	const changes: PreviewChange[] = [];

	for (const { sku, netDelta, logs: skuLogs } of aggregated) {
		if (filterSku && sku !== filterSku) continue;

		try {
			const variant = await findVariantBySku(sku);

			if (!variant) {
				changes.push({
					sku,
					ecomVariantId: null,
					stockBefore: null,
					delta: netDelta,
					stockAfter: null,
					status: 'skipped',
					error: 'No matching eCom variant found',
					logs: skuLogs
				});
				continue;
			}

			const stockBefore = variant.stockLevel;
			const stockAfter = Math.max(0, stockBefore + netDelta);

			changes.push({
				sku,
				ecomVariantId: variant.id,
				stockBefore,
				delta: netDelta,
				stockAfter: stockAfter === stockBefore ? stockBefore : stockAfter,
				status: stockAfter === stockBefore ? 'skipped' : 'updated',
				logs: skuLogs
			});
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			changes.push({
				sku,
				ecomVariantId: null,
				stockBefore: null,
				delta: netDelta,
				stockAfter: null,
				status: 'failed',
				error: message,
				logs: skuLogs
			});
		}
	}

	return {
		logsFound: logs.length,
		saleLogsFound: saleLogsCount,
		reasonCounts,
		changes,
		skipped: filterSku ? [] : skipped,
		watermarkBefore,
		wouldAdvanceTo: highestLogId
	};
}

// ── Post-sync verification ──────────────────────────────────────────

async function verifySyncResults(
	syncRunId: number,
	results: SkuResult[]
): Promise<VerificationResult> {
	const updatedResults = results.filter((r) => r.status === 'updated' && r.ecomVariantId);
	const warnings: Omit<SyncWarning, 'id' | 'acknowledged'>[] = [];
	let verified = 0;
	let mismatches = 0;
	const now = new Date().toISOString();

	for (const result of updatedResults) {
		try {
			const variant = await getVariant(result.ecomVariantId!);
			const actualStock = variant.stockLevel;
			const expectedStock = result.stockAfter!;

			if (actualStock !== expectedStock) {
				mismatches++;
				warnings.push({
					syncRunId,
					sku: result.sku,
					ecomVariantId: result.ecomVariantId,
					type: 'stock_mismatch',
					message: `Expected stock ${expectedStock} but eCom reports ${actualStock}`,
					expected: expectedStock,
					actual: actualStock,
					createdAt: now
				});
			} else {
				verified++;
			}

			// Warn on zero stock
			if (actualStock === 0) {
				warnings.push({
					syncRunId,
					sku: result.sku,
					ecomVariantId: result.ecomVariantId,
					type: 'zero_stock',
					message: `Stock is now 0 after sync`,
					expected: expectedStock,
					actual: actualStock,
					createdAt: now
				});
			}

			// Warn if we clamped to 0 (delta wanted to go negative)
			if (result.stockBefore !== null && result.stockBefore + result.delta < 0) {
				warnings.push({
					syncRunId,
					sku: result.sku,
					ecomVariantId: result.ecomVariantId,
					type: 'negative_stock',
					message: `Stock would have gone to ${result.stockBefore + result.delta}, clamped to 0`,
					expected: result.stockBefore + result.delta,
					actual: 0,
					createdAt: now
				});
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			mismatches++;
			warnings.push({
				syncRunId,
				sku: result.sku,
				ecomVariantId: result.ecomVariantId,
				type: 'verification_failed',
				message: `Could not verify: ${message}`,
				expected: result.stockAfter,
				actual: null,
				createdAt: now
			});
		}
	}

	// Persist warnings to DB
	if (warnings.length > 0) {
		insertWarnings(warnings);
	}

	return { verified, mismatches, warnings };
}

// ── Full sync ───────────────────────────────────────────────────────

export async function runSync(triggeredBy: TriggerSource): Promise<SyncRunRecord> {
	if (hasRunningSync()) {
		throw new Error('A sync is already running');
	}

	const run = createSyncRun(triggeredBy);
	const watermarkBefore = getWatermark();
	updateSyncRun(run.id, { watermarkBefore });

	// Clear item cache for this run
	itemCache.clear();

	try {
		const logs = await fetchInventoryLogs(watermarkBefore);

		if (logs.length === 0) {
			const now = new Date().toISOString();
			updateSyncRun(run.id, {
				status: 'success',
				logsProcessed: 0,
				log: [],
				finishedAt: now
			});
			return { ...run, status: 'success', logsProcessed: 0, log: [], verification: null, finishedAt: now };
		}

		const { aggregated, skipped, highestLogId } = await aggregateLogs(logs);
		const results: SkuResult[] = [...skipped];

		for (const { sku, netDelta } of aggregated) {
			try {
				const variant = await findVariantBySku(sku);

				if (!variant) {
					results.push({
						sku,
						ecomVariantId: null,
						stockBefore: null,
						delta: netDelta,
						stockAfter: null,
						status: 'skipped',
						error: 'No matching eCom variant found'
					});
					continue;
				}

				const stockBefore = variant.stockLevel;
				const stockAfter = Math.max(0, stockBefore + netDelta);

				if (stockAfter === stockBefore) {
					results.push({
						sku,
						ecomVariantId: variant.id,
						stockBefore,
						delta: netDelta,
						stockAfter: stockBefore,
						status: 'skipped',
						error: 'No net change'
					});
					continue;
				}

				await updateStockLevel(variant.id, stockAfter);

				results.push({
					sku,
					ecomVariantId: variant.id,
					stockBefore,
					delta: netDelta,
					stockAfter,
					status: 'updated'
				});
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				results.push({
					sku,
					ecomVariantId: null,
					stockBefore: null,
					delta: netDelta,
					stockAfter: null,
					status: 'failed',
					error: message
				});
			}
		}

		const updated = results.filter((r) => r.status === 'updated').length;
		const skippedCount = results.filter((r) => r.status === 'skipped').length;
		const failed = results.filter((r) => r.status === 'failed').length;
		const status = failed === 0 ? 'success' : updated > 0 ? 'partial' : 'failed';

		// Only advance watermark if not fully failed
		if (status !== 'failed') {
			setWatermark(highestLogId);
		}

		// Post-sync verification: re-query eCom to confirm changes
		let verification: VerificationResult | null = null;
		if (updated > 0) {
			verification = await verifySyncResults(run.id, results);
		}

		const now = new Date().toISOString();
		updateSyncRun(run.id, {
			status,
			logsProcessed: logs.length,
			skusUpdated: updated,
			skusSkipped: skippedCount,
			skusFailed: failed,
			watermarkAfter: status !== 'failed' ? highestLogId : watermarkBefore,
			log: results,
			verification: verification ?? undefined,
			finishedAt: now
		});

		return {
			...run,
			status,
			logsProcessed: logs.length,
			skusUpdated: updated,
			skusSkipped: skippedCount,
			skusFailed: failed,
			watermarkBefore,
			watermarkAfter: status !== 'failed' ? highestLogId : watermarkBefore,
			log: results,
			verification,
			finishedAt: now
		};
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		updateSyncRun(run.id, {
			status: 'failed',
			error: message,
			finishedAt: new Date().toISOString()
		});
		throw e;
	}
}
