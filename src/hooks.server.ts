import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { demoAuthUsersById } from '$lib/server/demo/data';
import { DEMO_SESSION_COOKIE } from '$lib/server/demo/session';

const DEMO_MODE = env.DEMO_MODE === 'true';

// No database in demo mode, so "session lookup" is just reading which demo
// user's id (if any) is in the session cookie set by /login. No cookie, or a
// stale/unknown id, means logged out — same as real auth, just backed by an
// in-memory map instead of Postgres.
const handleDemoAuth: Handle = ({ event, resolve }) => {
	const uid = event.cookies.get(DEMO_SESSION_COOKIE);
	const user = uid ? demoAuthUsersById.get(uid) : undefined;
	if (user) event.locals.user = user;
	return resolve(event);
};

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	// Dynamic import so $lib/server/auth (and its DB-backed betterAuth(...)
	// construction) is never evaluated at all in demo mode.
	const { auth } = await import('$lib/server/auth');
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = DEMO_MODE ? handleDemoAuth : handleBetterAuth;
