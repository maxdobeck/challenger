import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { clearDemoSession } from '$lib/server/demo/session';

const DEMO_MODE = env.DEMO_MODE === 'true';

export const load: PageServerLoad = () => {
	return redirect(302, '/');
};

export const actions: Actions = {
	default: async (event) => {
		if (DEMO_MODE) {
			// Only the session goes. An account registered in demo mode lives in a
			// separate cookie and is kept, so signing out and back in works the way
			// it does with a real account instead of destroying it.
			clearDemoSession(event.cookies);
		} else {
			const { auth } = await import('$lib/server/auth');
			await auth.api.signOut({ headers: event.request.headers });
		}
		return redirect(302, '/login');
	}
};
