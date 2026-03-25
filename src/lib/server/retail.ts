import { env } from '$env/dynamic/private';
import { getSetting } from '$lib/server/store';
import type { InventoryLogEntry, RSeriesItem, RSeriesTokenResponse } from '$lib/types';

// ── Token cache ─────────────────────────────────────────────────────

let tokenCache: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
	if (tokenCache && Date.now() < tokenCache.expiresAt) {
		return tokenCache.accessToken;
	}

	const refreshToken = getSetting('ls_retail_refresh_token');
	if (!refreshToken) throw new Error('R-Series refresh token not configured. Complete OAuth setup first.');

	const res = await fetch('https://cloud.merchantos.com/oauth/access_token.php', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			client_id: env.LS_RETAIL_CLIENT_ID!,
			client_secret: env.LS_RETAIL_CLIENT_SECRET!,
			refresh_token: refreshToken
		})
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`R-Series token refresh failed (${res.status}): ${text}`);
	}

	const data: RSeriesTokenResponse = await res.json();
	tokenCache = {
		accessToken: data.access_token,
		expiresAt: Date.now() + (data.expires_in - 60) * 1000 // refresh 60s early
	};

	return tokenCache.accessToken;
}

// ── Rate limiting ───────────────────────────────────────────────────

let lastRequest = 0;

async function rateLimit(): Promise<void> {
	const elapsed = Date.now() - lastRequest;
	if (elapsed < 500) {
		await new Promise((r) => setTimeout(r, 500 - elapsed));
	}
	lastRequest = Date.now();
}

// ── Authenticated fetch ─────────────────────────────────────────────

function getAccountId(): string {
	const id = getSetting('ls_retail_account_id');
	if (!id) throw new Error('R-Series account ID not configured. Complete OAuth setup first.');
	return id;
}

const API_BASE = () => `https://api.merchantos.com/API/Account/${getAccountId()}`;

async function retailFetch<T>(path: string): Promise<T> {
	await rateLimit();
	const token = await getAccessToken();

	const res = await fetch(`${API_BASE()}${path}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json'
		}
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`R-Series API error (${res.status}): ${text}`);
	}

	return res.json();
}

// ── Public API ──────────────────────────────────────────────────────

export async function fetchInventoryLogs(sinceLogId = 0): Promise<InventoryLogEntry[]> {
	const data = await retailFetch<{ InventoryLog?: InventoryLogEntry | InventoryLogEntry[] }>(
		`/InventoryLog.json?inventoryLogID=%3E,${sinceLogId}&orderby=inventoryLogID&limit=100`
	);

	if (!data.InventoryLog) return [];

	// R-Series returns a single object instead of an array when there's only one result
	return Array.isArray(data.InventoryLog) ? data.InventoryLog : [data.InventoryLog];
}

export async function fetchItem(itemId: string): Promise<RSeriesItem> {
	const data = await retailFetch<{ Item: RSeriesItem }>(`/Item/${itemId}.json`);
	return data.Item;
}
