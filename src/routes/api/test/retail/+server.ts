import { json } from '@sveltejs/kit';
import { fetchInventoryLogsSince, fetchRecentSales } from '$lib/server/retail';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		// Fetch today's logs
		const today = new Date().toISOString().split('T')[0] + 'T00:00:00';
		const logs = await fetchInventoryLogsSince(today);

		const reasonCounts: Record<string, number> = {};
		for (const log of logs) {
			reasonCounts[log.reason] = (reasonCounts[log.reason] || 0) + 1;
		}

		const recentSales = await fetchRecentSales(5);

		return json({
			ok: true,
			since: today,
			logsCount: logs.length,
			reasonCounts,
			logs,
			recentSales
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return json({ ok: false, error: message }, { status: 500 });
	}
};
