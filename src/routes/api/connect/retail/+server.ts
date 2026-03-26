import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const redirectUri = `${url.origin}/api/connect/retail/callback`;

	const params = new URLSearchParams({
		response_type: 'code',
		client_id: env.LS_RETAIL_CLIENT_ID!,
		scope: 'employee:all',
		redirect_uri: redirectUri
	});

	redirect(302, `https://cloud.merchantos.com/oauth/authorize.php?${params}`);
};
