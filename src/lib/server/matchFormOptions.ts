import { desc, ne } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { team, tournament, user } from '$lib/server/db/schema';
import { getDemoOpponents, getDemoTeams, getDemoTournamentOptions } from '$lib/server/demo/data';

const DEMO_MODE = env.DEMO_MODE === 'true';

// Dropdown data shared by every "log a match" entry point (the manual form
// and the Quick Upload chat flow) so they can't drift from each other.
export async function getMatchFormOptions(currentUserId: string) {
	const teams = DEMO_MODE ? getDemoTeams() : await db.select().from(team).orderBy(team.name);
	const opponents = DEMO_MODE
		? getDemoOpponents(currentUserId)
		: await db
				.select({ id: user.id, name: user.name })
				.from(user)
				.where(ne(user.id, currentUserId))
				.orderBy(user.name);
	const tournaments = DEMO_MODE
		? getDemoTournamentOptions()
		: await db
				.select({ id: tournament.id, name: tournament.name })
				.from(tournament)
				.orderBy(desc(tournament.startDate));

	return { teams, opponents, tournaments };
}
