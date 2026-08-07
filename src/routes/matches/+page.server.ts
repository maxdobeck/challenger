import { fail, redirect } from '@sveltejs/kit';
import { desc, eq, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { match, team, tournament, user } from '$lib/server/db/schema';

const player1Team = alias(team, 'player1_team');
const player2Team = alias(team, 'player2_team');
const player1User = alias(user, 'player1_user');
const player2User = alias(user, 'player2_user');

export const load: PageServerLoad = async (event) => {
	const currentUser = event.locals.user;
	if (!currentUser) {
		return redirect(302, '/login');
	}

	const teams = await db.select().from(team).orderBy(team.name);
	const opponents = await db
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(ne(user.id, currentUser.id))
		.orderBy(user.name);
	const tournaments = await db
		.select({ id: tournament.id, name: tournament.name })
		.from(tournament)
		.orderBy(desc(tournament.startDate));

	const rows = await db
		.select({
			id: match.id,
			tournament: tournament.name,
			playedAt: match.playedAt,
			player1Id: match.player1Id,
			player2Id: match.player2Id,
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
		.innerJoin(player1Team, eq(match.player1TeamId, player1Team.id))
		.innerJoin(player2Team, eq(match.player2TeamId, player2Team.id))
		.innerJoin(player1User, eq(match.player1Id, player1User.id))
		.innerJoin(player2User, eq(match.player2Id, player2User.id))
		.leftJoin(tournament, eq(match.tournamentId, tournament.id))
		.where(or(eq(match.player1Id, currentUser.id), eq(match.player2Id, currentUser.id)))
		.orderBy(desc(match.playedAt));

	const matches = rows.map((r) => {
		const youArePlayer1 = r.player1Id === currentUser.id;
		const you = {
			name: youArePlayer1 ? r.player1Name : r.player2Name,
			team: youArePlayer1 ? r.player1TeamName : r.player2TeamName,
			crit: youArePlayer1 ? r.player1Crit : r.player2Crit,
			tac: youArePlayer1 ? r.player1Tac : r.player2Tac,
			kill: youArePlayer1 ? r.player1Kill : r.player2Kill,
			primary: youArePlayer1 ? r.player1Primary : r.player2Primary
		};
		const opponent = {
			name: youArePlayer1 ? r.player2Name : r.player1Name,
			team: youArePlayer1 ? r.player2TeamName : r.player1TeamName,
			crit: youArePlayer1 ? r.player2Crit : r.player1Crit,
			tac: youArePlayer1 ? r.player2Tac : r.player1Tac,
			kill: youArePlayer1 ? r.player2Kill : r.player1Kill,
			primary: youArePlayer1 ? r.player2Primary : r.player1Primary
		};
		const yourTotal = you.crit + you.tac + you.kill + you.primary;
		const opponentTotal = opponent.crit + opponent.tac + opponent.kill + opponent.primary;
		const result = yourTotal > opponentTotal ? 'win' : yourTotal < opponentTotal ? 'loss' : 'draw';

		return {
			id: r.id,
			tournament: r.tournament,
			playedAt: r.playedAt,
			you,
			opponent,
			yourTotal,
			opponentTotal,
			result
		};
	});

	return { teams, opponents, tournaments, matches };
};

function parseScore(formData: FormData, key: string) {
	const raw = formData.get(key)?.toString();
	return raw ? Number(raw) : 0;
}

export const actions: Actions = {
	logMatch: async (event) => {
		const currentUser = event.locals.user;
		if (!currentUser) {
			return redirect(302, '/login');
		}

		const formData = await event.request.formData();
		const opponentId = formData.get('opponentId')?.toString();
		const player1TeamId = Number(formData.get('player1TeamId'));
		const player2TeamId = Number(formData.get('player2TeamId'));
		const rawTournamentId = formData.get('tournamentId')?.toString();
		const tournamentId = rawTournamentId ? Number(rawTournamentId) : null;

		if (!opponentId || !player1TeamId || !player2TeamId) {
			return fail(400, { message: 'Opponent and both teams are required.' });
		}

		await db.insert(match).values({
			player1Id: currentUser.id,
			player2Id: opponentId,
			player1TeamId,
			player2TeamId,
			tournamentId,
			player1Crit: parseScore(formData, 'player1Crit'),
			player1Tac: parseScore(formData, 'player1Tac'),
			player1Kill: parseScore(formData, 'player1Kill'),
			player1Primary: parseScore(formData, 'player1Primary'),
			player2Crit: parseScore(formData, 'player2Crit'),
			player2Tac: parseScore(formData, 'player2Tac'),
			player2Kill: parseScore(formData, 'player2Kill'),
			player2Primary: parseScore(formData, 'player2Primary')
		});

		return { success: true };
	}
};
