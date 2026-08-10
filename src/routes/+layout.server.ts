import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { getUserProfile, DEFAULT_PROFILE } from '$lib/server/users';

export const load: LayoutServerLoad = async (event) => {
	const user = event.locals.user ?? null;
	const demoMode = env.DEMO_MODE === 'true';
	// Precompute the user's LD attributes here so the client can identify with
	// them immediately. In demo mode `db` is a placeholder and the user isn't
	// Postgres-backed, so fall back to defaults instead of querying.
	const profile = user && !demoMode ? await getUserProfile(user.id) : DEFAULT_PROFILE;
	return { user, demoMode, profile };
};
