import { json } from '@sveltejs/kit';
import { acknowledgeWarning } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	acknowledgeWarning(parseInt(params.id));
	return json({ ok: true });
};
