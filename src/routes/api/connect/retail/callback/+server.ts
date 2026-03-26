import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { setSetting } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const code = url.searchParams.get('code');

	if (!code) {
		const error = url.searchParams.get('error') || 'No authorization code received';
		return json({ error }, { status: 400 });
	}

	const redirectUri = `${url.origin}/api/connect/retail/callback`;

	// Exchange authorization code for tokens
	const res = await fetch('https://cloud.merchantos.com/oauth/access_token.php', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			client_id: env.LS_RETAIL_CLIENT_ID!,
			client_secret: env.LS_RETAIL_CLIENT_SECRET!,
			redirect_uri: redirectUri
		})
	});

	if (!res.ok) {
		const text = await res.text();
		return json({ error: `Token exchange failed (${res.status})`, detail: text }, { status: 500 });
	}

	const data = await res.json();

	// Now we need the account ID — fetch it from the API
	const accountRes = await fetch('https://api.merchantos.com/API/Account.json', {
		headers: {
			Authorization: `Bearer ${data.access_token}`,
			Accept: 'application/json'
		}
	});

	let accountId = '';
	if (accountRes.ok) {
		const accountData = await accountRes.json();
		const account = accountData.Account;
		if (Array.isArray(account)) {
			accountId = account[0]?.accountID || '';
		} else if (account?.accountID) {
			accountId = account.accountID;
		}
	}

	if (accountId) {
		setSetting('ls_retail_account_id', accountId);
	}
	setSetting('ls_retail_refresh_token', data.refresh_token);

	return json({
		message: 'OAuth successful! Account ID and refresh token saved to database.',
		account_id: accountId,
		account_id_saved: !!accountId,
		refresh_token_saved: true
	});
};
