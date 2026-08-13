import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { APIError } from 'better-auth/api';
import { env } from '$env/dynamic/private';
import { DEMO_LOGIN_ACCOUNTS, DEMO_LOGIN_PASSWORD } from '$lib/server/db/demo-fixtures';
import { demoAuthUsersByEmail } from '$lib/server/demo/data';
import { DEMO_SESSION_COOKIE } from '$lib/server/demo/session';

const DEMO_MODE = env.DEMO_MODE === 'true';

export const load: PageServerLoad = (event) => {
	if (event.locals.user) {
		return redirect(302, '/leaderboard');
	}
	return { demoAccounts: DEMO_LOGIN_ACCOUNTS, demoMode: DEMO_MODE };
};

// Demo mode's stand-in for a password check: any of the curated demo emails
// (case-insensitive, matching better-auth's own normalization) logs in as
// that account directly, since there's no database to verify a password
// against. Returns null when the email isn't a known demo account.
function signInDemoUser(event: RequestEvent, email: string) {
	const user = demoAuthUsersByEmail.get(email.toLowerCase());
	if (!user) return null;
	event.cookies.set(DEMO_SESSION_COOKIE, user.id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax'
	});
	return user;
}

export const actions: Actions = {
	signInEmail: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		if (DEMO_MODE) {
			if (!signInDemoUser(event, email)) {
				return fail(400, { message: 'Unknown demo account — pick one from the list below.' });
			}
			return redirect(302, '/leaderboard');
		}

		const { auth } = await import('$lib/server/auth');
		try {
			await auth.api.signInEmail({
				body: { email, password }
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || 'Sign in failed' });
			}
			return fail(500, { message: 'Unexpected error' });
		}

		return redirect(302, '/leaderboard');
	},
	loginAs: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('loginAsEmail')?.toString() ?? '';

		// Only sign in as one of the curated demo accounts — never an arbitrary
		// email/password pair submitted through this endpoint.
		const account = DEMO_LOGIN_ACCOUNTS.find((a) => a.email === email);
		if (!account) {
			return fail(400, { message: 'Unknown demo account' });
		}

		if (DEMO_MODE) {
			if (!signInDemoUser(event, account.email)) {
				return fail(400, { message: 'Unknown demo account' });
			}
			return redirect(302, '/leaderboard');
		}

		const { auth } = await import('$lib/server/auth');
		try {
			await auth.api.signInEmail({
				body: { email: account.email, password: DEMO_LOGIN_PASSWORD }
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || 'Sign in failed' });
			}
			return fail(500, { message: 'Unexpected error' });
		}

		return redirect(302, '/leaderboard');
	}
};
