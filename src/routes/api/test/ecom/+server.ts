import { json } from '@sveltejs/kit';
import { fetchVariants } from '$lib/server/ecom';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const variants = await fetchVariants(1, 10);

		return json({
			ok: true,
			variantsCount: variants.length,
			sample: variants[0] ?? null
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return json({ ok: false, error: message }, { status: 500 });
	}
};
