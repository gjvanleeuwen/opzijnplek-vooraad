// ── R-Series (Retail POS) ────────────────────────────────────────────

export interface InventoryLogEntry {
	inventoryLogID: string;
	itemID: string;
	qohChange: string; // signed integer as string from API
	createTime: string;
	reason: string;
	saleID?: string;
}

export interface RSeriesItem {
	itemID: string;
	customSku: string;
	systemSku: string;
	upc: string;
	ean: string;
	description: string;
}

export interface RSeriesTokenResponse {
	access_token: string;
	expires_in: number;
	token_type: string;
}

export const SALE_REASONS = ['AdjustmentForSale', 'ReturnForSale'] as const;

// ── eCom C-Series (webshopapp) ───────────────────────────────────────

export interface EcomVariant {
	id: number;
	sku: string;
	ean: string;
	articleCode: string;
	stockLevel: number;
	stockTracking: string;
	title: string;
}

// ── Sync ─────────────────────────────────────────────────────────────

export type SyncStatus = 'running' | 'success' | 'partial' | 'failed';
export type TriggerSource = 'schedule' | 'manual';

export interface SkuResult {
	sku: string;
	ecomVariantId: number | null;
	stockBefore: number | null;
	delta: number;
	stockAfter: number | null;
	status: 'updated' | 'skipped' | 'failed';
	error?: string;
}

export type WarningType = 'stock_mismatch' | 'negative_stock' | 'zero_stock' | 'verification_failed';

export interface SyncWarning {
	id: number;
	syncRunId: number;
	sku: string;
	ecomVariantId: number | null;
	type: WarningType;
	message: string;
	expected: number | null;
	actual: number | null;
	acknowledged: boolean;
	createdAt: string;
}

export interface VerificationResult {
	verified: number;
	mismatches: number;
	warnings: Omit<SyncWarning, 'id' | 'acknowledged'>[];
}

export interface SyncRunRecord {
	id: number;
	status: SyncStatus;
	triggeredBy: TriggerSource;
	logsProcessed: number;
	skusUpdated: number;
	skusSkipped: number;
	skusFailed: number;
	watermarkBefore: number | null;
	watermarkAfter: number | null;
	log: SkuResult[];
	error: string | null;
	startedAt: string;
	finishedAt: string | null;
	verification: VerificationResult | null;
}
