import { expect, test, type Page, type Route } from '@playwright/test';
import { loginAsMax } from './helpers';
import { scoreScanFixtures, type ScoreScanFixture } from './fixtures/score-scan-fixtures';
import { sampleScoreTrackerImageBuffer } from './fixtures/sample-score-tracker';

// The AI (a raw Anthropic vision call in src/routes/matches/scan/+server.ts)
// isn't reachable from CI or from a fresh checkout -- neither .env.demo nor
// the Playwright workflow sets ANTHROPIC_API_KEY, and the server-side fetch
// to Anthropic runs in the preview server process, which page.route can't
// intercept anyway. So these tests mock the browser-to-/matches/scan
// response instead, and verify that whatever the AI returns for
// crit_op/kill_op/tac_op round-trips correctly into the match form, landing
// on a total of CRIT + KILL + TAC once applied.
async function mockScanResponse(page: Page, fixture: ScoreScanFixture) {
	await page.route('**/matches/scan', async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				crit_op: fixture.critOp,
				kill_op: fixture.killOp,
				tac_op: fixture.tacOp
			})
		});
	});
}

async function scanAndApply(page: Page, groupName: 'You' | 'Opponent') {
	const group = page.getByRole('group', { name: groupName, exact: true });

	await group
		.locator('input[type="file"]')
		.setInputFiles({
			name: 'score-tracker.png',
			mimeType: 'image/png',
			buffer: sampleScoreTrackerImageBuffer()
		});

	const scanResults = group.locator('.scan-results');
	await expect(scanResults).toBeVisible();

	// Read the draft values before clicking Apply -- applying clears the
	// draft, so .scan-results disappears from the DOM immediately after.
	const draft = {
		crit: await scanResults.getByLabel('Crit (0-6)').inputValue(),
		kill: await scanResults.getByLabel('Kill (0-6)').inputValue(),
		tac: await scanResults.getByLabel('Tac (0-6)').inputValue()
	};

	await group.getByRole('button', { name: `Apply to ${groupName}'s scores`, exact: true }).click();
	await expect(scanResults).toBeHidden();

	return draft;
}

for (const fixture of scoreScanFixtures) {
	test(`scanning a tracker (${fixture.name}) applies a CRIT + KILL + TAC total to the form`, async ({
		page
	}) => {
		const pageErrors: Error[] = [];
		page.on('pageerror', (err) => pageErrors.push(err));

		await loginAsMax(page);
		await page.goto('/matches');

		await mockScanResponse(page, fixture);

		const draft = await scanAndApply(page, 'You');

		expect(draft.crit).toBe(String(fixture.critOp));
		expect(draft.kill).toBe(String(fixture.killOp));
		expect(draft.tac).toBe(String(fixture.tacOp));

		const crit = Number(await page.locator('input[name="player1Crit"]').inputValue());
		const kill = Number(await page.locator('input[name="player1Kill"]').inputValue());
		const tac = Number(await page.locator('input[name="player1Tac"]').inputValue());

		expect(crit).toBe(fixture.critOp);
		expect(kill).toBe(fixture.killOp);
		expect(tac).toBe(fixture.tacOp);
		expect(crit + kill + tac).toBe(fixture.critOp + fixture.killOp + fixture.tacOp);

		expect(pageErrors).toEqual([]);
	});
}

test('scanning both players independently does not cross-contaminate their scores', async ({
	page
}) => {
	const [youFixture, opponentFixture] = scoreScanFixtures;

	await loginAsMax(page);
	await page.goto('/matches');

	await mockScanResponse(page, youFixture);
	await scanAndApply(page, 'You');

	await mockScanResponse(page, opponentFixture);
	await scanAndApply(page, 'Opponent');

	const youCrit = Number(await page.locator('input[name="player1Crit"]').inputValue());
	const youKill = Number(await page.locator('input[name="player1Kill"]').inputValue());
	const youTac = Number(await page.locator('input[name="player1Tac"]').inputValue());
	expect(youCrit + youKill + youTac).toBe(
		youFixture.critOp + youFixture.killOp + youFixture.tacOp
	);

	const oppCrit = Number(await page.locator('input[name="player2Crit"]').inputValue());
	const oppKill = Number(await page.locator('input[name="player2Kill"]').inputValue());
	const oppTac = Number(await page.locator('input[name="player2Tac"]').inputValue());
	expect(oppCrit + oppKill + oppTac).toBe(
		opponentFixture.critOp + opponentFixture.killOp + opponentFixture.tacOp
	);
});
