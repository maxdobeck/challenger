import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (event) => {
	return { user: event.locals.user ?? null };
};
