// Fetches every match a target user has played, in a shape unopinionated
// about "your team" vs. "opponent's team" — team-stats.ts normalizes that
// per-perspective. Extracted from /stats's original inline query so
// /teams/[id] can fetch the identical row set.

import { eq, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { match, team, tournament } from '$lib/server/db/schema';
import { getDemoStatsRows } from '$lib/server/demo/data';

const DEMO_MODE = env.DEMO_MODE === 'true';

const player1Team = alias(team, 'player1_team');
const player2Team = alias(team, 'player2_team');

export type UserMatchRow = {
	player1Id: string;
	player1TeamId: number;
	player1TeamName: string;
	player2TeamId: number;
	player2TeamName: string;
	tournamentId: number | null;
	tournamentName: string | null;
	playedAt: Date;
	player1Crit: number;
	player1Tac: number;
	player1Kill: number;
	player1Primary: number;
	player2Crit: number;
	player2Tac: number;
	player2Kill: number;
	player2Primary: number;
};

export async function getUserMatchRows(targetUserId: string): Promise<UserMatchRow[]> {
	if (DEMO_MODE) {
		return getDemoStatsRows(targetUserId);
	}

	return db
		.select({
			player1Id: match.player1Id,
			player1TeamId: player1Team.id,
			player1TeamName: player1Team.name,
			player2TeamId: player2Team.id,
			player2TeamName: player2Team.name,
			tournamentId: match.tournamentId,
			tournamentName: tournament.name,
			playedAt: match.playedAt,
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
		.leftJoin(tournament, eq(match.tournamentId, tournament.id))
		.where(or(eq(match.player1Id, targetUserId), eq(match.player2Id, targetUserId)));
}
