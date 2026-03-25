import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		// Verify DB is accessible
		db.select({ count: sql<number>`1` }).from(settings).get();

		return json({ status: 'ok', timestamp: new Date().toISOString() });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Unknown error';
		return json({ status: 'error', error: message }, { status: 503 });
	}
};
