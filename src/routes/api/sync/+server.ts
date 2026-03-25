import { json } from '@sveltejs/kit';
import { runSync } from '$lib/server/sync';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	try {
		const result = await runSync('manual');
		return json(result);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		const status = message.includes('already running') ? 409 : 500;
		return json({ error: message }, { status });
	}
};
