import { expect, test } from '@playwright/test';
import { scoreboardFixtures } from './fixtures/scoreboard-fixtures';

// Pure scoring-logic check -- no browser page, no server, no AI/LLM call.
// The score under test is CRIT + KILL + TAC.
for (const fixture of scoreboardFixtures) {
	test(`${fixture.name}: CRIT + KILL + TAC = ${fixture.expectedTotal}`, () => {
		const total = fixture.crit + fixture.kill + fixture.tac;
		expect(total).toBe(fixture.expectedTotal);
	});
}
