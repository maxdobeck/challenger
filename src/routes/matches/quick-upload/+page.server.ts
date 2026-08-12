import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getMatchFormOptions } from '$lib/server/matchFormOptions';

export const load: PageServerLoad = async (event) => {
	const currentUser = event.locals.user;
	if (!currentUser) {
		return redirect(302, '/login');
	}

	return await getMatchFormOptions(currentUser.id);
};
