// Static scoreboard fixtures for the pure CRIT + KILL + TAC total check.
// Add more entries here to cover additional scoreboard states -- each one
// automatically gets its own test case in scoreboard-scoring.e2e.ts.
export type ScoreboardFixture = {
	name: string;
	// Recorded for reference only -- Primary isn't part of the CRIT + KILL +
	// TAC total under test.
	prim: number;
	crit: number;
	kill: number;
	tac: number;
	expectedTotal: number;
};

export const scoreboardFixtures: ScoreboardFixture[] = [
	{ name: 'confirmed-scoreboard', prim: 4, crit: 5, kill: 2, tac: 4, expectedTotal: 11 }
];
