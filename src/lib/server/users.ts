import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const DEFAULT_PROFILE = { hasPlayedTournament: false, totalMatches: 0 };

/**
 * Fetch the precomputed LaunchDarkly attributes for a user. Falls back to
 * DEFAULT_PROFILE when no row exists yet (e.g. a brand-new account that hasn't
 * logged a match, or a demo user that isn't backed by Postgres).
 */
export async function getUserProfile(userId: string) {
	const rows = await db
		.select({
			hasPlayedTournament: userProfile.hasPlayedTournament,
			totalMatches: userProfile.totalMatches
		})
		.from(userProfile)
		.where(eq(userProfile.userId, userId))
		.limit(1);
	return rows[0] ?? DEFAULT_PROFILE;
}
