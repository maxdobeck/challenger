import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { match, team, user } from '$lib/server/db/schema';
import { getDemoLeaderboardRows } from '$lib/server/demo/data';
import { outcomeFor, pickBestTeam, totalScore, winRate } from '$lib/server/scoring';

const DEMO_MODE = env.DEMO_MODE === 'true';

const player1User = alias(user, 'player1_user');
const player2User = alias(user, 'player2_user');
const player1Team = alias(team, 'player1_team');
const player2Team = alias(team, 'player2_team');

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}

	const rows = DEMO_MODE
		? getDemoLeaderboardRows()
		: await db
				.select({
					player1Id: match.player1Id,
					player1Name: player1User.name,
					player2Id: match.player2Id,
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
				.innerJoin(player2Team, eq(match.player2TeamId, player2Team.id));

	const byUser = new Map<
		string,
		{
			userId: string;
			userName: string;
			games: number;
			wins: number;
			losses: number;
			draws: number;
			teamWins: Map<string, { games: number; wins: number }>;
		}
	>();

	function record(
		userId: string,
		userName: string,
		teamName: string,
		result: 'win' | 'loss' | 'draw'
	) {
		const entry = byUser.get(userId) ?? {
			userId,
			userName,
			games: 0,
			wins: 0,
			losses: 0,
			draws: 0,
			teamWins: new Map<string, { games: number; wins: number }>()
		};
		entry.games++;
		if (result === 'win') entry.wins++;
		else if (result === 'loss') entry.losses++;
		else entry.draws++;

		const teamEntry = entry.teamWins.get(teamName) ?? { games: 0, wins: 0 };
		teamEntry.games++;
		if (result === 'win') teamEntry.wins++;
		entry.teamWins.set(teamName, teamEntry);

		byUser.set(userId, entry);
	}

	for (const row of rows) {
		const p1Total = totalScore({
			crit: row.player1Crit,
			tac: row.player1Tac,
			kill: row.player1Kill,
			primary: row.player1Primary
		});
		const p2Total = totalScore({
			crit: row.player2Crit,
			tac: row.player2Tac,
			kill: row.player2Kill,
			primary: row.player2Primary
		});
		const p1Result = outcomeFor(p1Total, p2Total);
		const p2Result = outcomeFor(p2Total, p1Total);

		record(row.player1Id, row.player1Name, row.player1TeamName, p1Result);
		record(row.player2Id, row.player2Name, row.player2TeamName, p2Result);
	}

	const leaderboard = [...byUser.values()]
		.map((u) => ({
			userId: u.userId,
			userName: u.userName,
			games: u.games,
			wins: u.wins,
			losses: u.losses,
			draws: u.draws,
			winRate: winRate(u.wins, u.games),
			bestTeam: pickBestTeam(u.teamWins)
		}))
		.sort((a, b) => b.winRate - a.winRate || b.games - a.games);

	return { leaderboard, currentUserId: event.locals.user.id };
};
