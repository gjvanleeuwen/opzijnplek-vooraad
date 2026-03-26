import { env } from '$env/dynamic/private';
import type { EcomVariant } from '$lib/types';

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

const API_BASE = () => `https://api.webshopapp.com/${env.LS_ECOM_LANGUAGE || 'nl'}`;

async function ecomFetch<T>(path: string, options?: RequestInit): Promise<T> {
	await rateLimit();

	const credentials = btoa(`${env.LS_ECOM_API_KEY}:${env.LS_ECOM_API_SECRET}`);

	const res = await fetch(`${API_BASE()}${path}`, {
		...options,
		headers: {
			Authorization: `Basic ${credentials}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
			...options?.headers
		}
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`eCom API error (${res.status}): ${text}`);
	}

	return res.json();
}

// ── Public API ──────────────────────────────────────────────────────

interface VariantsResponse {
	variants: EcomVariant[];
}

interface VariantResponse {
	variant: EcomVariant;
}

export async function getVariant(id: number): Promise<EcomVariant> {
	const data = await ecomFetch<VariantResponse>(`/variants/${id}.json`);
	return data.variant;
}

export async function findVariantBySku(skuOrCandidates: string | string[]): Promise<EcomVariant | null> {
	const candidates = Array.isArray(skuOrCandidates) ? skuOrCandidates : [skuOrCandidates];
	const ecomFields = ['sku', 'ean', 'articleCode'] as const;

	// For each candidate, try each eCom field
	for (const candidate of candidates) {
		for (const field of ecomFields) {
			const data = await ecomFetch<VariantsResponse>(
				`/variants.json?${field}=${encodeURIComponent(candidate)}`
			);
			if (data.variants.length > 0) return data.variants[0];
		}
	}

	return null;
}

export async function updateStockLevel(variantId: number, newLevel: number): Promise<EcomVariant> {
	const data = await ecomFetch<VariantResponse>(`/variants/${variantId}.json`, {
		method: 'PUT',
		body: JSON.stringify({ variant: { stockLevel: newLevel } })
	});
	return data.variant;
}

export async function fetchVariants(page = 1, limit = 50): Promise<EcomVariant[]> {
	const data = await ecomFetch<VariantsResponse>(
		`/variants.json?page=${page}&limit=${limit}`
	);
	return data.variants;
}
