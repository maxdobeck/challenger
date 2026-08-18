import { describe, expect, it } from 'vitest';
import { demoUsers, demoMatches, demoAttendees } from './data';
import {
	HEAVY_TOURNEY_USER,
	HEAVY_TOURNEY_MATCH_COUNT,
	DEMO_TOURNAMENT_COUNT
} from '$lib/server/db/demo-fixtures';

// demo/data.ts builds its dataset once at import time from a fixed PRNG seed,
// so these assertions cover exactly what a running demo server serves.
describe('the heavytourneyuser demo persona', () => {
	const heavy = demoUsers.find((u) => u.email === HEAVY_TOURNEY_USER.email);
	const heavyMatches = demoMatches.filter(
		(m) => m.player1Id === heavy?.id || m.player2Id === heavy?.id
	);

	it('exists in the demo roster', () => {
		expect(heavy).toBeDefined();
	});

	it('has exactly HEAVY_TOURNEY_MATCH_COUNT matches', () => {
		expect(heavyMatches.length).toBe(HEAVY_TOURNEY_MATCH_COUNT);
	});

	it('played every one of them at a tournament', () => {
		expect(heavyMatches.every((m) => m.tournamentId !== null)).toBe(true);
	});

	// One match per event, so the By-Tournament stats table shows a full
	// HEAVY_TOURNEY_MATCH_COUNT rows rather than a handful of repeated events.
	it('played each of those at a distinct tournament', () => {
		const tournamentIds = new Set(heavyMatches.map((m) => m.tournamentId));
		expect(tournamentIds.size).toBe(HEAVY_TOURNEY_MATCH_COUNT);
	});

	it('is registered as an attendee of exactly those tournaments', () => {
		const attended = demoAttendees.filter((a) => a.userId === heavy?.id);
		expect(attended.length).toBe(HEAVY_TOURNEY_MATCH_COUNT);
	});

	// The persona needs one tournament per match; anything less and the
	// generator would have to double up on events.
	it('needs no more tournaments than the demo generates', () => {
		expect(HEAVY_TOURNEY_MATCH_COUNT).toBeLessThanOrEqual(DEMO_TOURNAMENT_COUNT);
	});
});
