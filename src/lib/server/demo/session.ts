import type { Cookies } from '@sveltejs/kit';

// Demo mode has no database, so "logged in" is just this cookie holding a
// known demo user's id (see demoAuthUsersById in ./data.ts) rather than a
// real better-auth session. Shared between hooks.server.ts (reads it) and
// the /login and /logout actions (write/clear it) so the name can't drift.
export const DEMO_SESSION_COOKIE = 'demo_uid';

// An account registered through /register while in demo mode. The seeded users
// live in a module-level dataset rebuilt on every cold start, and there's no
// database or KV to add one to, so the account itself rides in this cookie:
// the browser holding it *is* the account. hooks.server.ts feeds it back into
// the in-memory maps on each request, which is what makes it survive a cold
// start or a different serverless instance.
//
// Deliberately unsigned, matching DEMO_SESSION_COOKIE, which anyone can already
// set to any seeded demo user's id. Demo mode has no real accounts to protect —
// forging this cookie grants you an empty profile in a throwaway dataset. Do
// not copy this pattern into the database-backed path, where better-auth issues
// a signed session token.
export const DEMO_ACCOUNT_COOKIE = 'demo_account';

export type DemoAccount = { id: string; name: string; email: string };

const COOKIE_OPTIONS = { path: '/', httpOnly: true, sameSite: 'lax' } as const;

// A month: long enough that a registered demo account is still there when
// someone comes back to the preview later in the day, short enough to expire.
const ACCOUNT_MAX_AGE = 60 * 60 * 24 * 30;

export function setDemoSession(cookies: Cookies, userId: string) {
	cookies.set(DEMO_SESSION_COOKIE, userId, COOKIE_OPTIONS);
}

export function clearDemoSession(cookies: Cookies) {
	cookies.delete(DEMO_SESSION_COOKIE, { path: '/' });
}

export function setDemoAccount(cookies: Cookies, account: DemoAccount) {
	cookies.set(DEMO_ACCOUNT_COOKIE, encodeDemoAccount(account), {
		...COOKIE_OPTIONS,
		maxAge: ACCOUNT_MAX_AGE
	});
}

/**
 * Read the registered account, or null when there isn't one. Returns null
 * rather than throwing on anything malformed — a truncated or hand-edited
 * cookie should read as "not registered", not as a 500 on every route.
 */
export function readDemoAccount(cookies: Cookies): DemoAccount | null {
	const raw = cookies.get(DEMO_ACCOUNT_COOKIE);
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			typeof (parsed as DemoAccount).id !== 'string' ||
			typeof (parsed as DemoAccount).name !== 'string' ||
			typeof (parsed as DemoAccount).email !== 'string'
		) {
			return null;
		}
		const { id, name, email } = parsed as DemoAccount;
		return id && name && email ? { id, name, email } : null;
	} catch {
		return null;
	}
}

function encodeDemoAccount(account: DemoAccount) {
	return Buffer.from(JSON.stringify(account), 'utf8').toString('base64url');
}
