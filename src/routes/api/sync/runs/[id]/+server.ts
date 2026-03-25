import { json } from '@sveltejs/kit';
import { getRun } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const run = getRun(parseInt(params.id));
	if (!run) {
		return json({ error: 'Run not found' }, { status: 404 });
	}
	return json(run);
};
