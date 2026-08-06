import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { match, user } from '$lib/server/db/schema';

const player1User = alias(user, 'player1_user');
const player2User = alias(user, 'player2_user');

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}

	const rows = await db
		.select({
			player1Id: match.player1Id,
			player1Name: player1User.name,
			player2Id: match.player2Id,
			player2Name: player2User.name,
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
		.innerJoin(player2User, eq(match.player2Id, player2User.id));

	const byUser = new Map<
		string,
		{ userId: string; userName: string; games: number; wins: number; losses: number; draws: number }
	>();

	function record(userId: string, userName: string, result: 'win' | 'loss' | 'draw') {
		const entry = byUser.get(userId) ?? {
			userId,
			userName,
			games: 0,
			wins: 0,
			losses: 0,
			draws: 0
		};
		entry.games++;
		if (result === 'win') entry.wins++;
		else if (result === 'loss') entry.losses++;
		else entry.draws++;
		byUser.set(userId, entry);
	}

	for (const row of rows) {
		const p1Total = row.player1Crit + row.player1Tac + row.player1Kill + row.player1Primary;
		const p2Total = row.player2Crit + row.player2Tac + row.player2Kill + row.player2Primary;
		const p1Result = p1Total > p2Total ? 'win' : p1Total < p2Total ? 'loss' : 'draw';
		const p2Result = p2Total > p1Total ? 'win' : p2Total < p1Total ? 'loss' : 'draw';

		record(row.player1Id, row.player1Name, p1Result);
		record(row.player2Id, row.player2Name, p2Result);
	}

	const leaderboard = [...byUser.values()]
		.map((u) => ({ ...u, winRate: u.games ? u.wins / u.games : 0 }))
		.sort((a, b) => b.winRate - a.winRate || b.games - a.games);

	return { leaderboard, currentUserId: event.locals.user.id };
};
