import { json } from '@sveltejs/kit';
import { getUnacknowledgedWarnings } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(getUnacknowledgedWarnings());
};
