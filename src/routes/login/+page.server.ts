import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { APIError } from 'better-auth/api';
import { env } from '$env/dynamic/private';
import { DEMO_LOGIN_ACCOUNTS, DEMO_LOGIN_PASSWORD } from '$lib/server/db/demo-fixtures';
import { demoAuthUsersByEmail, authenticateDemoUser, registerDemoUser } from '$lib/server/demo/data';
import { DEMO_SESSION_COOKIE } from '$lib/server/demo/session';

const DEMO_MODE = env.DEMO_MODE === 'true';

export const load: PageServerLoad = (event) => {
	if (event.locals.user) {
		return redirect(302, '/leaderboard');
	}
	const deleted = event.url.searchParams.get('deleted') === '1';
	return { demoAccounts: DEMO_LOGIN_ACCOUNTS, demoMode: DEMO_MODE, deleted };
};

// Demo mode's stand-in for a password check. Curated demo emails
// (case-insensitive, matching better-auth's own normalization) log in
// directly, regardless of password — there's no database to verify one
// against. Accounts created through demo-mode registration (see
// signUpEmail below) are real, individually deletable identities, so those
// do have their password checked. Returns null when neither matches.
function signInDemoUser(event: RequestEvent, email: string, password: string) {
	const user = demoAuthUsersByEmail.get(email.toLowerCase()) ?? authenticateDemoUser(email, password);
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
			if (!signInDemoUser(event, email, password)) {
				return fail(400, {
					message: 'Unknown demo account, or incorrect password for a registered one.'
				});
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
			if (!signInDemoUser(event, account.email, DEMO_LOGIN_PASSWORD)) {
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
	},
	signUpEmail: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const name = formData.get('name')?.toString() ?? '';

		if (DEMO_MODE) {
			// Unlike the curated demo accounts, a registered account is a real,
			// individually deletable identity scoped to this server process —
			// this is what powers trying out account deletion in demo mode.
			if (!email || !password) {
				return fail(400, { message: 'Email and password are required.' });
			}
			const created = registerDemoUser({ name: name || email, email, password });
			if (!created) {
				return fail(400, { message: 'That email is already in use.' });
			}
			event.cookies.set(DEMO_SESSION_COOKIE, created.id, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax'
			});
			return redirect(302, '/leaderboard');
		}

		const { auth } = await import('$lib/server/auth');
		try {
			await auth.api.signUpEmail({
				body: { email, password, name }
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || 'Registration failed' });
			}
			return fail(500, { message: 'Unexpected error' });
		}

		return redirect(302, '/leaderboard');
	}
};
