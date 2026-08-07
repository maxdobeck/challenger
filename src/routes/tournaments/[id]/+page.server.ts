import { error, redirect } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { match, team, tournament, tournamentAttendee, user } from '$lib/server/db/schema';

const player1User = alias(user, 'player1_user');
const player2User = alias(user, 'player2_user');
const player1Team = alias(team, 'player1_team');
const player2Team = alias(team, 'player2_team');

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}

	const id = Number(event.params.id);
	if (!Number.isInteger(id)) {
		return error(404, 'Tournament not found');
	}

	const [found] = await db.select().from(tournament).where(eq(tournament.id, id));
	if (!found) {
		return error(404, 'Tournament not found');
	}

	const attendees = await db
		.select({
			id: user.id,
			name: user.name,
			registeredAt: tournamentAttendee.registeredAt
		})
		.from(tournamentAttendee)
		.innerJoin(user, eq(tournamentAttendee.userId, user.id))
		.where(eq(tournamentAttendee.tournamentId, id))
		.orderBy(user.name);

	const matchRows = await db
		.select({
			id: match.id,
			playedAt: match.playedAt,
			player1Name: player1User.name,
			player2Name: player2User.name,
			player1TeamName: player1Team.name,
			player2TeamName: player2Team.name,
			player1Crit: match.player1Crit,
			player1Tac: match.player1Tac,
			player1Kill: match.player1Kill,
			player1Primary: match.player1Primary,
			player2Crit: match.player2Crit,
			player2Tac: match.player2Tac,
			player2Kill: match.player2Kill,
			player2Primary: match.player2Primary
		})
		.from(match)
		.innerJoin(player1User, eq(match.player1Id, player1User.id))
		.innerJoin(player2User, eq(match.player2Id, player2User.id))
		.innerJoin(player1Team, eq(match.player1TeamId, player1Team.id))
		.innerJoin(player2Team, eq(match.player2TeamId, player2Team.id))
		.where(eq(match.tournamentId, id))
		.orderBy(desc(match.playedAt));

	const matches = matchRows.map((r) => {
		const player1Total = r.player1Crit + r.player1Tac + r.player1Kill + r.player1Primary;
		const player2Total = r.player2Crit + r.player2Tac + r.player2Kill + r.player2Primary;
		const result =
			player1Total > player2Total ? 'p1' : player1Total < player2Total ? 'p2' : 'draw';
		return {
			id: r.id,
			playedAt: r.playedAt,
			player1Name: r.player1Name,
			player2Name: r.player2Name,
			player1TeamName: r.player1TeamName,
			player2TeamName: r.player2TeamName,
			player1Total,
			player2Total,
			result
		};
	});

	return { tournament: found, attendees, matches };
};
