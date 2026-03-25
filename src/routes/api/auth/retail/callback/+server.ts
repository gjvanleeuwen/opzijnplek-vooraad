import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const code = url.searchParams.get('code');

	if (!code) {
		const error = url.searchParams.get('error') || 'No authorization code received';
		return json({ error }, { status: 400 });
	}

	const redirectUri = `${url.origin}/api/auth/retail/callback`;

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

	let accountId = env.LS_RETAIL_ACCOUNT_ID || '';
	if (accountRes.ok) {
		const accountData = await accountRes.json();
		const account = accountData.Account;
		if (Array.isArray(account)) {
			accountId = account[0]?.accountID || accountId;
		} else if (account?.accountID) {
			accountId = account.accountID;
		}
	}

	// Return the tokens — user needs to save them to .env manually
	return json({
		message: 'OAuth successful! Add these to your .env file:',
		LS_RETAIL_ACCOUNT_ID: accountId,
		LS_RETAIL_REFRESH_TOKEN: data.refresh_token,
		access_token: data.access_token,
		expires_in: data.expires_in,
		note: 'The refresh_token is long-lived. The access_token expires and will be auto-refreshed.'
	});
};
