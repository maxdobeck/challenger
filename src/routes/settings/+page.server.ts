import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { isCuratedDemoUser, deleteRegisteredDemoUser } from '$lib/server/demo/data';
import { DEMO_SESSION_COOKIE } from '$lib/server/demo/session';

const DEMO_MODE = env.DEMO_MODE === 'true';
const CONFIRM_TEXT = 'delete';

export const load: PageServerLoad = (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	return {
		isCuratedDemoAccount: DEMO_MODE && isCuratedDemoUser(event.locals.user.id)
	};
};

export const actions: Actions = {
	deleteAccount: async (event) => {
		const currentUser = event.locals.user;
		if (!currentUser) {
			return redirect(302, '/login');
		}

		// The curated demo personas (Max, test1, ...) are shared fixtures that
		// other sessions and tests depend on — only accounts created through
		// demo-mode registration are actually deletable.
		if (DEMO_MODE && isCuratedDemoUser(currentUser.id)) {
			return fail(400, {
				message: "This demo account is shared and can't be deleted. Register a temporary account to try deletion."
			});
		}

		const formData = await event.request.formData();
		const confirmText = formData.get('confirmText')?.toString() ?? '';
		const confirmChecked = formData.get('confirmChecked') === 'on';

		// Re-check both conditions server-side rather than trusting the client's
		// disabled button.
		if (confirmText !== CONFIRM_TEXT || !confirmChecked) {
			return fail(400, {
				message: 'Type "delete" and check the confirmation box to continue.'
			});
		}

		if (DEMO_MODE) {
			deleteRegisteredDemoUser(currentUser.id);
			event.cookies.delete(DEMO_SESSION_COOKIE, { path: '/' });
			return redirect(302, '/login?deleted=1');
		}

		const { auth } = await import('$lib/server/auth');
		// End the session first, while the session/user rows still exist, so the
		// session cookie is cleared on the response same as /logout does.
		await auth.api.signOut({ headers: event.request.headers });

		// Every FK to user.id that matters (session, account, tournamentAttendee,
		// match, scanEvent, userProfile) is ON DELETE CASCADE, and
		// tournament.createdById is ON DELETE SET NULL, so Postgres handles all
		// cleanup — no manual fan-out deletes needed.
		await db.delete(user).where(eq(user.id, currentUser.id));

		return redirect(302, '/login?deleted=1');
	}
};
