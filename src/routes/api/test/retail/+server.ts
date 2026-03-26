import { json } from '@sveltejs/kit';
import { fetchInventoryLogs, fetchItem } from '$lib/server/retail';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const logs = await fetchInventoryLogs(0);

		// Count reasons to see what's actually in the logs
		const reasonCounts: Record<string, number> = {};
		for (const log of logs) {
			reasonCounts[log.reason] = (reasonCounts[log.reason] || 0) + 1;
		}

		let sampleItem = null;
		if (logs.length > 0) {
			sampleItem = await fetchItem(logs[0].itemID);
		}

		return json({
			ok: true,
			logsCount: logs.length,
			reasonCounts,
			sampleLogs: logs.slice(0, 5),
			sampleItem
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return json({ ok: false, error: message }, { status: 500 });
	}
};
