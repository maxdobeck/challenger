import { fail, redirect } from '@sveltejs/kit';
import { desc, eq, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { match, team, tournament, user, userProfile } from '$lib/server/db/schema';
import { addDemoMatch, getDemoUserMatchRows } from '$lib/server/demo/data';
import { getMatchFormOptions } from '$lib/server/matchFormOptions';
import { derivePrimary, outcomeFor, totalScore, type PrimaryOpChoice } from '$lib/server/scoring';

const DEMO_MODE = env.DEMO_MODE === 'true';

const player1Team = alias(team, 'player1_team');
const player2Team = alias(team, 'player2_team');
const player1User = alias(user, 'player1_user');
const player2User = alias(user, 'player2_user');

export const load: PageServerLoad = async (event) => {
	const currentUser = event.locals.user;
	if (!currentUser) {
		return redirect(302, '/login');
	}

	const { teams, opponents, tournaments } = await getMatchFormOptions(currentUser.id);

	const rows = DEMO_MODE
		? await getDemoUserMatchRows(currentUser.id)
		: await db
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
					player1PrimaryOpChoice: match.player1PrimaryOpChoice,
					player2Crit: match.player2Crit,
					player2Tac: match.player2Tac,
					player2Kill: match.player2Kill,
					player2Primary: match.player2Primary,
					player2PrimaryOpChoice: match.player2PrimaryOpChoice
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
			primary: youArePlayer1 ? r.player1Primary : r.player2Primary,
			primaryOpChoice: youArePlayer1 ? r.player1PrimaryOpChoice : r.player2PrimaryOpChoice
		};
		const opponent = {
			name: youArePlayer1 ? r.player2Name : r.player1Name,
			team: youArePlayer1 ? r.player2TeamName : r.player1TeamName,
			crit: youArePlayer1 ? r.player2Crit : r.player1Crit,
			tac: youArePlayer1 ? r.player2Tac : r.player1Tac,
			kill: youArePlayer1 ? r.player2Kill : r.player1Kill,
			primary: youArePlayer1 ? r.player2Primary : r.player1Primary,
			primaryOpChoice: youArePlayer1 ? r.player2PrimaryOpChoice : r.player1PrimaryOpChoice
		};
		const yourTotal = totalScore(you);
		const opponentTotal = totalScore(opponent);
		const result = outcomeFor(yourTotal, opponentTotal);

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

const PRIMARY_OP_CHOICES: readonly PrimaryOpChoice[] = ['crit', 'kill', 'tac'];

function parsePrimaryOpChoice(formData: FormData, key: string): PrimaryOpChoice | null {
	const raw = formData.get(key)?.toString();
	return (PRIMARY_OP_CHOICES as readonly string[]).includes(raw ?? '')
		? (raw as PrimaryOpChoice)
		: null;
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

		const player1PrimaryOpChoice = parsePrimaryOpChoice(formData, 'player1PrimaryOpChoice');
		const player2PrimaryOpChoice = parsePrimaryOpChoice(formData, 'player2PrimaryOpChoice');
		if (!player1PrimaryOpChoice || !player2PrimaryOpChoice) {
			return fail(400, { message: 'Choose a Primary Op for both players.' });
		}

		const player1Crit = parseScore(formData, 'player1Crit');
		const player1Tac = parseScore(formData, 'player1Tac');
		const player1Kill = parseScore(formData, 'player1Kill');
		const player2Crit = parseScore(formData, 'player2Crit');
		const player2Tac = parseScore(formData, 'player2Tac');
		const player2Kill = parseScore(formData, 'player2Kill');

		const values = {
			player1Id: currentUser.id,
			player2Id: opponentId,
			player1TeamId,
			player2TeamId,
			tournamentId,
			player1Crit,
			player1Tac,
			player1Kill,
			player1Primary: derivePrimary(player1PrimaryOpChoice, {
				crit: player1Crit,
				tac: player1Tac,
				kill: player1Kill
			}),
			player1PrimaryOpChoice,
			player2Crit,
			player2Tac,
			player2Kill,
			player2Primary: derivePrimary(player2PrimaryOpChoice, {
				crit: player2Crit,
				tac: player2Tac,
				kill: player2Kill
			}),
			player2PrimaryOpChoice
		};

		if (DEMO_MODE) {
			await addDemoMatch(values);
		} else {
			await db.insert(match).values(values);
			// Keep the precomputed LD attributes in sync with the match table.
			// Only a tournament match sets the flag; a casual match still bumps
			// totalMatches for both players.
			const playedTournament = values.tournamentId != null;
			await db
				.insert(userProfile)
				.values([
					{ userId: values.player1Id, hasPlayedTournament: playedTournament, totalMatches: 1 },
					{ userId: values.player2Id, hasPlayedTournament: playedTournament, totalMatches: 1 }
				])
				.onConflictDoUpdate({
					target: userProfile.userId,
					set: {
						// Monotonic OR: once true, stays true — a later casual match
						// never downgrades a veteran back to false.
						hasPlayedTournament: sql`${userProfile.hasPlayedTournament} OR ${playedTournament}`,
						totalMatches: sql`${userProfile.totalMatches} + 1`,
						updatedAt: sql`now()`
					}
				});
		}

		return { success: true };
	}
};
