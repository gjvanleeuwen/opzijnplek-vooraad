import { json } from '@sveltejs/kit';
import { getWatermark, setWatermark } from '$lib/server/store';
import { getInventoryLogCount } from '$lib/server/retail';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const current = getWatermark();
		const { count, highestId } = await getInventoryLogCount();
		return json({ current, totalLogs: count, highestLogId: highestId });
	} catch (e) {
		// If R-Series isn't connected, still return watermark
		const current = getWatermark();
		return json({ current, totalLogs: null, highestLogId: null });
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	const { watermark } = await request.json();
	if (typeof watermark !== 'number' || watermark < 0) {
		return json({ error: 'Invalid watermark value' }, { status: 400 });
	}
	setWatermark(watermark);
	return json({ ok: true, watermark });
};
