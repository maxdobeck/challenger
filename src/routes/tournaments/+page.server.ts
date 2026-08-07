import { redirect } from '@sveltejs/kit';
import { count, desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { tournament, tournamentAttendee } from '$lib/server/db/schema';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}

	// Attendee count is derived here (COUNT over the join) rather than stored —
	// single source of truth, no risk of a cached column drifting.
	const tournaments = await db
		.select({
			id: tournament.id,
			name: tournament.name,
			startDate: tournament.startDate,
			endDate: tournament.endDate,
			location: tournament.location,
			attendees: count(tournamentAttendee.userId)
		})
		.from(tournament)
		.leftJoin(tournamentAttendee, eq(tournamentAttendee.tournamentId, tournament.id))
		.groupBy(tournament.id)
		.orderBy(desc(tournament.startDate));

	return { tournaments };
};
