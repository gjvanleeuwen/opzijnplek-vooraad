import { env } from '$env/dynamic/private';
import { getRecentRuns, getUnacknowledgedWarnings } from '$lib/server/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const runs = getRecentRuns(20);
	const warnings = getUnacknowledgedWarnings();
	const retailConnected = !!(env.LS_RETAIL_REFRESH_TOKEN && env.LS_RETAIL_ACCOUNT_ID);

	return { runs, warnings, retailConnected };
};
