import { describe, expect, it } from 'vitest';
import { aggregateByTeam, aggregateByTournament, toUserMatchViews } from './team-stats';
import type { UserMatchRow } from './match-history';

const USER = 'user-1';
const OPPONENT = 'user-2';

function row(overrides: Partial<UserMatchRow> = {}): UserMatchRow {
	return {
		player1Id: USER,
		player1TeamId: 1,
		player1TeamName: 'Kasrkin',
		player2TeamId: 2,
		player2TeamName: 'Farstalker Kinband',
		tournamentId: null,
		tournamentName: null,
		playedAt: new Date('2026-01-01T00:00:00Z'),
		player1Crit: 2,
		player1Tac: 2,
		player1Kill: 2,
		player1Primary: 2,
		player2Crit: 0,
		player2Tac: 0,
		player2Kill: 0,
		player2Primary: 0,
		...overrides
	};
}

describe('toUserMatchViews', () => {
	it('resolves "your" team from player1 when the target user is player1', () => {
		const [view] = toUserMatchViews([row()], USER);
		expect(view.teamId).toBe(1);
		expect(view.opponentTeamId).toBe(2);
		expect(view.result).toBe('win');
	});

	it('resolves "your" team from player2 when the target user is not player1', () => {
		// getUserMatchRows already filters to rows where the target user is
		// player1 or player2, so toUserMatchViews only needs to check
		// player1Id — anyone else on the row is treated as "you" via player2.
		const [view] = toUserMatchViews([row({ player1Id: OPPONENT })], USER);
		expect(view.teamId).toBe(2);
		expect(view.opponentTeamId).toBe(1);
		expect(view.result).toBe('loss');
	});

	it('resolves the correct side in a mirror matchup (both players on the same team)', () => {
		const [view] = toUserMatchViews(
			[row({ player2TeamId: 1, player2TeamName: 'Kasrkin' })],
			USER
		);
		expect(view.teamId).toBe(1);
		expect(view.opponentTeamId).toBe(1);
		expect(view.opponentTeamName).toBe('Kasrkin');
	});
});

describe('aggregateByTeam', () => {
	it('groups by team id and sorts by games played, descending', () => {
		const views = toUserMatchViews(
			[
				row({ player1TeamId: 1, player1TeamName: 'Kasrkin' }),
				row({ player1TeamId: 1, player1TeamName: 'Kasrkin' }),
				row({ player1TeamId: 3, player1TeamName: 'Hearthkyn Salvagers' })
			],
			USER
		);
		const stats = aggregateByTeam(views);
		expect(stats[0]).toMatchObject({ teamId: 1, teamName: 'Kasrkin', games: 2, wins: 2 });
		expect(stats[1]).toMatchObject({ teamId: 3, games: 1 });
	});

	it('returns an empty array for no matches', () => {
		expect(aggregateByTeam([])).toEqual([]);
	});

	it('computes win rate per team', () => {
		const views = toUserMatchViews(
			[
				row(), // win
				row({ player1Crit: 0, player1Tac: 0, player1Kill: 0, player1Primary: 0 }) // draw
			],
			USER
		);
		const [stats] = aggregateByTeam(views);
		expect(stats.games).toBe(2);
		expect(stats.wins).toBe(1);
		expect(stats.draws).toBe(1);
		expect(stats.winRate).toBe(0.5);
	});
});

describe('aggregateByTournament', () => {
	it('only counts matches tied to a tournament', () => {
		const views = toUserMatchViews(
			[row({ tournamentId: null }), row({ tournamentId: 5, tournamentName: 'Nova Open' })],
			USER
		);
		const stats = aggregateByTournament(views);
		expect(stats).toHaveLength(1);
		expect(stats[0]).toMatchObject({ tournamentId: 5, tournamentName: 'Nova Open', games: 1 });
	});
});
