import { error, redirect } from '@sveltejs/kit';
import { eq, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { match, team, tournament, user } from '$lib/server/db/schema';
import { getDemoStatsRows, getDemoUserName } from '$lib/server/demo/data';
import { outcomeFor, totalScore, winRate } from '$lib/server/scoring';

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
					tournamentId: match.tournamentId,
					tournamentName: tournament.name,
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

	const byTeam = new Map<
		string,
		{ teamName: string; games: number; wins: number; losses: number; draws: number }
	>();

	// Keyed by tournament id (names can repeat across events); the name is kept
	// for display. Only matches tied to a tournament contribute here.
	const byTournament = new Map<
		number,
		{
			tournamentId: number;
			tournamentName: string;
			games: number;
			wins: number;
			losses: number;
			draws: number;
		}
	>();

	let totalWins = 0;
	let totalLosses = 0;
	let totalDraws = 0;

	for (const row of rows) {
		const youArePlayer1 = row.player1Id === targetUserId;
		const yourTeam = youArePlayer1 ? row.player1TeamName : row.player2TeamName;
		const player1Total = totalScore({
			crit: row.player1Crit,
			tac: row.player1Tac,
			kill: row.player1Kill,
			primary: row.player1Primary
		});
		const player2Total = totalScore({
			crit: row.player2Crit,
			tac: row.player2Tac,
			kill: row.player2Kill,
			primary: row.player2Primary
		});
		const yourTotal = youArePlayer1 ? player1Total : player2Total;
		const opponentTotal = youArePlayer1 ? player2Total : player1Total;

		const result = outcomeFor(yourTotal, opponentTotal);
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

		if (row.tournamentId != null && row.tournamentName != null) {
			const tEntry = byTournament.get(row.tournamentId) ?? {
				tournamentId: row.tournamentId,
				tournamentName: row.tournamentName,
				games: 0,
				wins: 0,
				losses: 0,
				draws: 0
			};
			tEntry.games++;
			if (result === 'win') tEntry.wins++;
			else if (result === 'loss') tEntry.losses++;
			else tEntry.draws++;
			byTournament.set(row.tournamentId, tEntry);
		}
	}

	const teamStats = [...byTeam.values()]
		.map((t) => ({ ...t, winRate: winRate(t.wins, t.games) }))
		.sort((a, b) => b.games - a.games);

	const tournamentStats = [...byTournament.values()]
		.map((t) => ({ ...t, winRate: winRate(t.wins, t.games) }))
		.sort((a, b) => b.games - a.games);

	const totalGames = rows.length;
	const favoriteTeam = teamStats[0]?.teamName ?? null;

	return {
		teamStats,
		tournamentStats,
		summary: {
			totalGames,
			totalWins,
			totalLosses,
			totalDraws,
			winRate: winRate(totalWins, totalGames),
			favoriteTeam
		},
		viewingOwnStats,
		playerName: targetUserName
	};
};
