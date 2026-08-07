import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { DEMO_USER } from '$lib/server/demo/data';

const DEMO_MODE = env.DEMO_MODE === 'true';

// No database in demo mode, so every request is auto-logged-in as the fixed
// demo user instead of going through better-auth's session lookup.
const handleDemoAuth: Handle = ({ event, resolve }) => {
	event.locals.user = DEMO_USER;
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
