import { json } from '@sveltejs/kit';
import { previewSync } from '$lib/server/sync';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const filterSku = url.searchParams.get('sku') ?? undefined;
		const preview = await previewSync(filterSku);
		return json(preview);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return json({ error: message }, { status: 500 });
	}
};
