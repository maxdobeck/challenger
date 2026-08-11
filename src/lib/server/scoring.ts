// Kill Team match scoring, shared by every route that turns raw match rows
// (crit/tac/kill/primary per player) into a total and a result. Extracted
// here because matches/leaderboard/stats/tournaments[id] each need the same
// "sum the four categories, then compare" logic — keeping one implementation
// means a scoring fix can't drift between routes.

export type ScoreSet = {
	crit: number;
	tac: number;
	kill: number;
	primary: number;
};

export function totalScore(score: ScoreSet): number {
	return score.crit + score.tac + score.kill + score.primary;
}

export type Outcome = 'win' | 'loss' | 'draw';

// Outcome from the perspective of the player whose total is `yourTotal`.
export function outcomeFor(yourTotal: number, opponentTotal: number): Outcome {
	if (yourTotal > opponentTotal) return 'win';
	if (yourTotal < opponentTotal) return 'loss';
	return 'draw';
}

export type PlayerSlot = 'p1' | 'p2' | 'draw';

// Outcome expressed as "which player" rather than from either player's own
// perspective — used by the tournament detail view, which lists both
// players side by side instead of a "you vs opponent" pairing.
export function matchOutcome(player1Total: number, player2Total: number): PlayerSlot {
	if (player1Total > player2Total) return 'p1';
	if (player1Total < player2Total) return 'p2';
	return 'draw';
}

export function winRate(wins: number, games: number): number {
	return games ? wins / games : 0;
}

export type TeamRecord = { games: number; wins: number };

// Picks the team with the best win rate out of a player's per-team record,
// breaking ties by whichever of the tied teams has more games played. Used
// by the leaderboard to surface each player's "best team". Returns null for
// an empty record (a player with no logged matches).
export function pickBestTeam(teamRecords: Iterable<[string, TeamRecord]>): string | null {
	let bestTeam: string | null = null;
	let bestWinRate = -1;
	let bestGames = 0;
	for (const [teamName, stats] of teamRecords) {
		const rate = winRate(stats.wins, stats.games);
		if (rate > bestWinRate || (rate === bestWinRate && stats.games > bestGames)) {
			bestWinRate = rate;
			bestGames = stats.games;
			bestTeam = teamName;
		}
	}
	return bestTeam;
}
