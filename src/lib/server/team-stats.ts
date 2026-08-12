// Turns a target user's raw match rows into per-team and per-tournament
// aggregates. Single source of truth for "most played team" — used by both
// /stats (the "By Team" table + favorite team) and /teams/[id] (a team's
// detail stats + whether it's the viewed user's most-played team) — so the
// definition can't drift between the two routes.

import { outcomeFor, totalScore, winRate, type Outcome } from '$lib/server/scoring';
import type { UserMatchRow } from '$lib/server/match-history';

export type UserMatchView = {
	playedAt: Date;
	teamId: number;
	teamName: string;
	opponentTeamId: number;
	opponentTeamName: string;
	tournamentId: number | null;
	tournamentName: string | null;
	yourTotal: number;
	opponentTotal: number;
	result: Outcome;
};

// Normalizes a raw match row into "your" perspective. Selects by
// `player1Id`, not by team identity, so a mirror matchup (both players on
// the same team/faction) still resolves to the correct side.
export function toUserMatchViews(rows: UserMatchRow[], targetUserId: string): UserMatchView[] {
	return rows.map((row) => {
		const youArePlayer1 = row.player1Id === targetUserId;
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

		return {
			playedAt: row.playedAt,
			teamId: youArePlayer1 ? row.player1TeamId : row.player2TeamId,
			teamName: youArePlayer1 ? row.player1TeamName : row.player2TeamName,
			opponentTeamId: youArePlayer1 ? row.player2TeamId : row.player1TeamId,
			opponentTeamName: youArePlayer1 ? row.player2TeamName : row.player1TeamName,
			tournamentId: row.tournamentId,
			tournamentName: row.tournamentName,
			yourTotal,
			opponentTotal,
			result: outcomeFor(yourTotal, opponentTotal)
		};
	});
}

export type TeamAggregate = {
	teamId: number;
	teamName: string;
	games: number;
	wins: number;
	losses: number;
	draws: number;
	winRate: number;
};

// Grouped by team, sorted by games desc — aggregateByTeam(views)[0] is the
// app's definition of "favorite"/"most played" team. Deliberately not
// scoring.ts's pickBestTeam(), which optimizes for win rate instead (the
// leaderboard's "best team" concept — a different metric).
export function aggregateByTeam(views: UserMatchView[]): TeamAggregate[] {
	const byTeam = new Map<number, Omit<TeamAggregate, 'winRate'>>();
	for (const view of views) {
		const entry = byTeam.get(view.teamId) ?? {
			teamId: view.teamId,
			teamName: view.teamName,
			games: 0,
			wins: 0,
			losses: 0,
			draws: 0
		};
		entry.games++;
		if (view.result === 'win') entry.wins++;
		else if (view.result === 'loss') entry.losses++;
		else entry.draws++;
		byTeam.set(view.teamId, entry);
	}
	return [...byTeam.values()]
		.map((t) => ({ ...t, winRate: winRate(t.wins, t.games) }))
		.sort((a, b) => b.games - a.games);
}

export type TournamentAggregate = {
	tournamentId: number;
	tournamentName: string;
	games: number;
	wins: number;
	losses: number;
	draws: number;
	winRate: number;
};

// Grouped by tournament id (names can repeat across events). Only matches
// tied to a tournament contribute.
export function aggregateByTournament(views: UserMatchView[]): TournamentAggregate[] {
	const byTournament = new Map<number, Omit<TournamentAggregate, 'winRate'>>();
	for (const view of views) {
		if (view.tournamentId == null || view.tournamentName == null) continue;
		const entry = byTournament.get(view.tournamentId) ?? {
			tournamentId: view.tournamentId,
			tournamentName: view.tournamentName,
			games: 0,
			wins: 0,
			losses: 0,
			draws: 0
		};
		entry.games++;
		if (view.result === 'win') entry.wins++;
		else if (view.result === 'loss') entry.losses++;
		else entry.draws++;
		byTournament.set(view.tournamentId, entry);
	}
	return [...byTournament.values()]
		.map((t) => ({ ...t, winRate: winRate(t.wins, t.games) }))
		.sort((a, b) => b.games - a.games);
}
