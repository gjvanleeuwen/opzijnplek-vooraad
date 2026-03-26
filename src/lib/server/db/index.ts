import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

const dbPath = env.DATABASE_PATH || './data/opzijnplek.db';
const sqlite = new Database(dbPath);

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Auto-create tables if they don't exist
sqlite.exec(`
	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY NOT NULL,
		value TEXT NOT NULL,
		updated_at TEXT
	);
	CREATE TABLE IF NOT EXISTS watermark (
		id INTEGER PRIMARY KEY NOT NULL,
		last_inventory_log_id INTEGER NOT NULL DEFAULT 0,
		updated_at TEXT
	);
	CREATE TABLE IF NOT EXISTS sync_runs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		status TEXT NOT NULL,
		triggered_by TEXT NOT NULL,
		logs_processed INTEGER NOT NULL DEFAULT 0,
		skus_updated INTEGER NOT NULL DEFAULT 0,
		skus_skipped INTEGER NOT NULL DEFAULT 0,
		skus_failed INTEGER NOT NULL DEFAULT 0,
		watermark_before INTEGER,
		watermark_after INTEGER,
		log TEXT,
		error TEXT,
		started_at TEXT NOT NULL,
		finished_at TEXT,
		verification TEXT
	);
	CREATE TABLE IF NOT EXISTS sync_warnings (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		sync_run_id INTEGER NOT NULL,
		sku TEXT NOT NULL,
		ecom_variant_id INTEGER,
		type TEXT NOT NULL,
		message TEXT NOT NULL,
		expected INTEGER,
		actual INTEGER,
		acknowledged INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL
	);
`);

// Migrations: add columns that may not exist yet
const migrations: string[] = [
	`ALTER TABLE sync_runs ADD COLUMN sale_ids TEXT`
];

for (const sql of migrations) {
	try {
		sqlite.exec(sql);
	} catch {
		// Column already exists — ignore
	}
}

export const db = drizzle(sqlite, { schema });
