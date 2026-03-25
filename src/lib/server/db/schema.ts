import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const watermark = sqliteTable('watermark', {
	id: integer('id').primaryKey().$defaultFn(() => 1),
	lastInventoryLogId: integer('last_inventory_log_id').notNull().default(0),
	updatedAt: text('updated_at')
});

export const syncRuns = sqliteTable('sync_runs', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	status: text('status', { enum: ['running', 'success', 'partial', 'failed'] }).notNull(),
	triggeredBy: text('triggered_by', { enum: ['schedule', 'manual'] }).notNull(),
	logsProcessed: integer('logs_processed').notNull().default(0),
	skusUpdated: integer('skus_updated').notNull().default(0),
	skusSkipped: integer('skus_skipped').notNull().default(0),
	skusFailed: integer('skus_failed').notNull().default(0),
	watermarkBefore: integer('watermark_before'),
	watermarkAfter: integer('watermark_after'),
	log: text('log'), // JSON array of per-SKU results
	error: text('error'),
	startedAt: text('started_at').notNull(),
	finishedAt: text('finished_at'),
	verification: text('verification') // JSON: verification results
});

export const syncWarnings = sqliteTable('sync_warnings', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	syncRunId: integer('sync_run_id').notNull(),
	sku: text('sku').notNull(),
	ecomVariantId: integer('ecom_variant_id'),
	type: text('type', {
		enum: ['stock_mismatch', 'negative_stock', 'zero_stock', 'verification_failed']
	}).notNull(),
	message: text('message').notNull(),
	expected: integer('expected'),
	actual: integer('actual'),
	acknowledged: integer('acknowledged', { mode: 'boolean' }).notNull().default(false),
	createdAt: text('created_at').notNull()
});
