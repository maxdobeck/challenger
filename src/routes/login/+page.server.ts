import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';
import { DEMO_LOGIN_ACCOUNTS, DEMO_LOGIN_PASSWORD } from '$lib/server/db/demo-fixtures';

export const load: PageServerLoad = (event) => {
	if (event.locals.user) {
		return redirect(302, '/leaderboard');
	}
	return { demoAccounts: DEMO_LOGIN_ACCOUNTS };
};

export const actions: Actions = {
	signInEmail: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';

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
