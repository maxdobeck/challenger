import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { DEMO_SESSION_COOKIE } from '$lib/server/demo/session';

const DEMO_MODE = env.DEMO_MODE === 'true';

export const load: PageServerLoad = () => {
	return redirect(302, '/');
};

export const actions: Actions = {
	default: async (event) => {
		if (DEMO_MODE) {
			event.cookies.delete(DEMO_SESSION_COOKIE, { path: '/' });
		} else {
			const { auth } = await import('$lib/server/auth');
			await auth.api.signOut({ headers: event.request.headers });
		}
		return redirect(302, '/login');
	}
};
