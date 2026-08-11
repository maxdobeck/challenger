import { describe, expect, it } from 'vitest';
import { matchOutcome, outcomeFor, pickBestTeam, totalScore, winRate } from './scoring';

describe('totalScore', () => {
	it('sums all four score categories', () => {
		expect(totalScore({ crit: 1, tac: 2, kill: 3, primary: 4 })).toBe(10);
	});

	it('handles an all-zero score set', () => {
		expect(totalScore({ crit: 0, tac: 0, kill: 0, primary: 0 })).toBe(0);
	});
});

describe('outcomeFor', () => {
	it('is a win when your total is higher', () => {
		expect(outcomeFor(10, 7)).toBe('win');
	});

	it('is a loss when your total is lower', () => {
		expect(outcomeFor(7, 10)).toBe('loss');
	});

	it('is a draw when totals are equal', () => {
		expect(outcomeFor(8, 8)).toBe('draw');
	});

	it('is a draw when both totals are zero', () => {
		expect(outcomeFor(0, 0)).toBe('draw');
	});
});

describe('matchOutcome', () => {
	it('returns p1 when player 1 scores higher', () => {
		expect(matchOutcome(10, 7)).toBe('p1');
	});

	it('returns p2 when player 2 scores higher', () => {
		expect(matchOutcome(7, 10)).toBe('p2');
	});

	it('returns draw on a tie', () => {
		expect(matchOutcome(8, 8)).toBe('draw');
	});

	it('agrees with outcomeFor from either player perspective', () => {
		const p1 = 12;
		const p2 = 9;
		expect(matchOutcome(p1, p2)).toBe('p1');
		expect(outcomeFor(p1, p2)).toBe('win');
		expect(outcomeFor(p2, p1)).toBe('loss');
	});
});

describe('winRate', () => {
	it('divides wins by games', () => {
		expect(winRate(3, 4)).toBe(0.75);
	});

	it('is 0 for zero games, not NaN or a division error', () => {
		expect(winRate(0, 0)).toBe(0);
	});

	it('is 0 when a player has zero wins', () => {
		expect(winRate(0, 5)).toBe(0);
	});

	it('is 1 for a perfect record', () => {
		expect(winRate(5, 5)).toBe(1);
	});
});

describe('pickBestTeam', () => {
	it('returns null for an empty record', () => {
		expect(pickBestTeam([])).toBeNull();
	});

	it('picks the team with the higher win rate', () => {
		const records: [string, { games: number; wins: number }][] = [
			['Kasrkin', { games: 4, wins: 1 }],
			['Farstalker Kinband', { games: 4, wins: 3 }]
		];
		expect(pickBestTeam(records)).toBe('Farstalker Kinband');
	});

	it('breaks a tied win rate by whichever team played more games', () => {
		const records: [string, { games: number; wins: number }][] = [
			['Kasrkin', { games: 2, wins: 1 }], // 50%, 2 games
			['Farstalker Kinband', { games: 10, wins: 5 }] // 50%, 10 games
		];
		expect(pickBestTeam(records)).toBe('Farstalker Kinband');
	});

	it('keeps the first team when win rate and games are both tied', () => {
		const records: [string, { games: number; wins: number }][] = [
			['Kasrkin', { games: 4, wins: 2 }],
			['Farstalker Kinband', { games: 4, wins: 2 }]
		];
		expect(pickBestTeam(records)).toBe('Kasrkin');
	});

	it('does not let a winless-but-more-played team beat a perfect small sample', () => {
		// A single 1-0 team (100%) should still lose to a larger, lower win-rate one only
		// when its rate is actually lower — this asserts rate is compared before games.
		const records: [string, { games: number; wins: number }][] = [
			['Kasrkin', { games: 1, wins: 1 }], // 100%
			['Farstalker Kinband', { games: 20, wins: 15 }] // 75%
		];
		expect(pickBestTeam(records)).toBe('Kasrkin');
	});
});
