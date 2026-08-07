import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/private';

export const load: LayoutServerLoad = (event) => {
	return { user: event.locals.user ?? null, demoMode: env.DEMO_MODE === 'true' };
};
