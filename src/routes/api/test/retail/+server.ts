import { json } from '@sveltejs/kit';
import { fetchLatestInventoryLogs } from '$lib/server/retail';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const logs = await fetchLatestInventoryLogs(100);

		const reasonCounts: Record<string, number> = {};
		for (const log of logs) {
			reasonCounts[log.reason] = (reasonCounts[log.reason] || 0) + 1;
		}

		return json({
			ok: true,
			logsCount: logs.length,
			reasonCounts,
			// Show last 10 (most recent) for quick inspection
			latestLogs: logs.slice(-10)
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return json({ ok: false, error: message }, { status: 500 });
	}
};
