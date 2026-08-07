import { error, redirect } from '@sveltejs/kit';
import { eq, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { match, team, user } from '$lib/server/db/schema';
import { getDemoStatsRows, getDemoUserName } from '$lib/server/demo/data';

const DEMO_MODE = env.DEMO_MODE === 'true';

const player1Team = alias(team, 'player1_team');
const player2Team = alias(team, 'player2_team');

export const load: PageServerLoad = async (event) => {
	const currentUser = event.locals.user;
	if (!currentUser) {
		return redirect(302, '/login');
	}

	const requestedUserId = event.url.searchParams.get('user');
	const viewingOwnStats = !requestedUserId || requestedUserId === currentUser.id;
	const targetUserId = viewingOwnStats ? currentUser.id : requestedUserId;

	let targetUserName = currentUser.name;
	if (!viewingOwnStats) {
		if (DEMO_MODE) {
			const name = getDemoUserName(targetUserId);
			if (!name) {
				return error(404, 'Player not found');
			}
			targetUserName = name;
		} else {
			const [targetUser] = await db
				.select({ name: user.name })
				.from(user)
				.where(eq(user.id, targetUserId));
			if (!targetUser) {
				return error(404, 'Player not found');
			}
			targetUserName = targetUser.name;
		}
	}

	const rows = DEMO_MODE
		? getDemoStatsRows(targetUserId)
		: await db
				.select({
					player1Id: match.player1Id,
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
				.where(or(eq(match.player1Id, targetUserId), eq(match.player2Id, targetUserId)));

	const byTeam = new Map<
		string,
		{ teamName: string; games: number; wins: number; losses: number; draws: number }
	>();

	let totalWins = 0;
	let totalLosses = 0;
	let totalDraws = 0;

	for (const row of rows) {
		const youArePlayer1 = row.player1Id === targetUserId;
		const yourTeam = youArePlayer1 ? row.player1TeamName : row.player2TeamName;
		const yourTotal = youArePlayer1
			? row.player1Crit + row.player1Tac + row.player1Kill + row.player1Primary
			: row.player2Crit + row.player2Tac + row.player2Kill + row.player2Primary;
		const opponentTotal = youArePlayer1
			? row.player2Crit + row.player2Tac + row.player2Kill + row.player2Primary
			: row.player1Crit + row.player1Tac + row.player1Kill + row.player1Primary;

		const result = yourTotal > opponentTotal ? 'win' : yourTotal < opponentTotal ? 'loss' : 'draw';
		if (result === 'win') totalWins++;
		else if (result === 'loss') totalLosses++;
		else totalDraws++;

		const entry = byTeam.get(yourTeam) ?? {
			teamName: yourTeam,
			games: 0,
			wins: 0,
			losses: 0,
			draws: 0
		};
		entry.games++;
		if (result === 'win') entry.wins++;
		else if (result === 'loss') entry.losses++;
		else entry.draws++;
		byTeam.set(yourTeam, entry);
	}

	const teamStats = [...byTeam.values()]
		.map((t) => ({ ...t, winRate: t.games ? t.wins / t.games : 0 }))
		.sort((a, b) => b.games - a.games);

	const totalGames = rows.length;
	const favoriteTeam = teamStats[0]?.teamName ?? null;

	return {
		teamStats,
		summary: {
			totalGames,
			totalWins,
			totalLosses,
			totalDraws,
			winRate: totalGames ? totalWins / totalGames : 0,
			favoriteTeam
		},
		viewingOwnStats,
		playerName: targetUserName
	};
};
