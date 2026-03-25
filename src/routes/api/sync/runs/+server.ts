import { json } from '@sveltejs/kit';
import { getRecentRuns } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const limit = parseInt(url.searchParams.get('limit') ?? '20');
	const runs = getRecentRuns(limit);
	return json(runs);
};
