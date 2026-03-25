import { getRecentRuns, getUnacknowledgedWarnings } from '$lib/server/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const runs = getRecentRuns(20);
	const warnings = getUnacknowledgedWarnings();
	return { runs, warnings };
};
