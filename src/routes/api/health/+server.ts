import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		// Simple connectivity check — doesn't depend on any table existing
		db.run(sql`SELECT 1`);

		return json({ status: 'ok', timestamp: new Date().toISOString() });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Unknown error';
		return json({ status: 'error', error: message }, { status: 503 });
	}
};
