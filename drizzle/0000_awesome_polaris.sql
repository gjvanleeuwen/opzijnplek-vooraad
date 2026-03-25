CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL,
	`triggered_by` text NOT NULL,
	`logs_processed` integer DEFAULT 0 NOT NULL,
	`skus_updated` integer DEFAULT 0 NOT NULL,
	`skus_skipped` integer DEFAULT 0 NOT NULL,
	`skus_failed` integer DEFAULT 0 NOT NULL,
	`watermark_before` integer,
	`watermark_after` integer,
	`log` text,
	`error` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	`verification` text
);
--> statement-breakpoint
CREATE TABLE `sync_warnings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_run_id` integer NOT NULL,
	`sku` text NOT NULL,
	`ecom_variant_id` integer,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`expected` integer,
	`actual` integer,
	`acknowledged` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watermark` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_inventory_log_id` integer DEFAULT 0 NOT NULL,
	`updated_at` text
);
