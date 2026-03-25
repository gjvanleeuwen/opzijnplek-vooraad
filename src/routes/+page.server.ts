import { getRecentRuns, getUnacknowledgedWarnings, getSetting } from '$lib/server/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const runs = getRecentRuns(20);
	const warnings = getUnacknowledgedWarnings();
	const retailConnected = !!(getSetting('ls_retail_refresh_token') && getSetting('ls_retail_account_id'));

	return { runs, warnings, retailConnected };
};
