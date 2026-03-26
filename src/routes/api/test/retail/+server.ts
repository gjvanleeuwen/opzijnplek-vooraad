import { json } from '@sveltejs/kit';
import { fetchLatestInventoryLogs } from '$lib/server/retail';
import type { RequestHandler } from './$types';

// Re-export retailFetch indirectly for the sales check
import { getSetting } from '$lib/server/store';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async () => {
	try {
		const logs = await fetchLatestInventoryLogs(100);

		const reasonCounts: Record<string, number> = {};
		for (const log of logs) {
			reasonCounts[log.reason] = (reasonCounts[log.reason] || 0) + 1;
		}

		// Also check if any sales exist at all
		const accountId = getSetting('ls_retail_account_id');
		let recentSales = null;
		if (accountId) {
			// Borrow a token by importing the fetch helper indirectly
			const { fetchRecentSales } = await import('$lib/server/retail');
			recentSales = await fetchRecentSales(5);
		}

		return json({
			ok: true,
			totalLogs: logs.length,
			highestLogId: logs.length > 0 ? logs[logs.length - 1].inventoryLogID : null,
			reasonCounts,
			latestLogs: logs.slice(-10),
			recentSales
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return json({ ok: false, error: message }, { status: 500 });
	}
};
