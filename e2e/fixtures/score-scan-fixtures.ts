// CRIT/KILL/TAC values for the AI score-scan tests, plus a couple of edge
// states so the flow is exercised beyond just the one real fixture.
export type ScoreScanFixture = {
	name: string;
	critOp: number;
	killOp: number;
	tacOp: number;
	// Recorded for reference only -- Primary isn't part of the CRIT + KILL +
	// TAC total under test, and the scanner doesn't return it (it's derived
	// separately in ScorePhotoScan.svelte via ceil(chosen category / 2)).
	primaryOp?: number;
};

export const scoreScanFixtures: ScoreScanFixture[] = [
	// From a real scoreboard photo (PRIM 4, CRIT 5 -- the 2 plus a stray 3,
	// KILL 2, TAC 4). CRIT + KILL + TAC = 5 + 2 + 4 = 11.
	{ name: 'confirmed-scoreboard', critOp: 5, killOp: 2, tacOp: 4, primaryOp: 4 },
	{ name: 'all-zero', critOp: 0, killOp: 0, tacOp: 0 },
	{ name: 'all-max', critOp: 6, killOp: 6, tacOp: 6 }
];
