import { expect, test, type Page, type Route } from '@playwright/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { loginAsMax } from './helpers';
import { scoreScanFixtures } from './fixtures/score-scan-fixtures';
import { sampleScoreTrackerImageBuffer } from './fixtures/sample-score-tracker';
import * as schema from '../src/lib/server/db/schema';

const SEED_PASSWORD = 'password123';
const TEST1_EMAIL = 'test1@challenger.example.com';

// Reuses the same "confirmed-scoreboard" fixture as the existing scan test
// (CRIT 5, KILL 2, TAC 4) so both suites exercise the same known-good values.
const fixture = scoreScanFixtures[0];
const expectedPrimary = Math.ceil(fixture.critOp / 2);

async function mockScanResponse(page: Page) {
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

// Drives the chat through tally review, Primary-op choice, and the math
// confirmation step, leaving the caller to submit the underlying form.
async function reviewAndConfirm(page: Page) {
	await expect(
		page.getByText(`Here's what I read: CRIT ${fixture.critOp}, KILL ${fixture.killOp}, TAC ${fixture.tacOp}.`)
	).toBeVisible({ timeout: 15000 });

	await page.getByRole('button', { name: 'Crit', exact: true }).click();

	await expect(page.getByText(`Your Primary score is ${expectedPrimary}`, { exact: false })).toBeVisible();

	await page.getByRole('button', { name: 'Confirm', exact: true }).click();
}

async function fillAndSubmitMatchForm(page: Page) {
	// Attribute selectors rather than getByLabel: the "You"/"Opponent"
	// fieldsets both have a legend whose text overlaps with sibling labels
	// (e.g. the "Opponent" legend vs. the "Opponent" select's own label),
	// which makes accessible-name matching ambiguous.
	await page.locator('select[name="opponentId"]').selectOption({ index: 1 });
	await page.locator('select[name="player1TeamId"]').selectOption({ index: 1 });
	await page.locator('select[name="player2TeamId"]').selectOption({ index: 1 });
	await page.getByRole('button', { name: 'Log match', exact: true }).click();
	await expect(page).toHaveURL(/\/matches$/);
}

test('upload photo -> pick primary -> confirm math -> log match', async ({ page }) => {
	await loginAsMax(page);
	await page.goto('/matches/quick-upload');
	await mockScanResponse(page);

	// Same hydration-timing gotcha as the existing scan test: the file input's
	// change handler only exists once Svelte hydrates.
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Upload Photo', { exact: true }).setInputFiles({
		name: 'score-tracker.png',
		mimeType: 'image/png',
		buffer: sampleScoreTrackerImageBuffer()
	});

	await reviewAndConfirm(page);

	await expect(page.locator('input[name="player1Crit"]')).toHaveValue(String(fixture.critOp));
	await expect(page.locator('input[name="player1Kill"]')).toHaveValue(String(fixture.killOp));
	await expect(page.locator('input[name="player1Tac"]')).toHaveValue(String(fixture.tacOp));
	await expect(page.locator('input[name="player1Primary"]')).toHaveValue(String(expectedPrimary));
	await expect(page.locator('input[name="player1PrimaryOpChoice"]')).toHaveValue('crit');

	await fillAndSubmitMatchForm(page);
});

// Functionally identical to the Upload Photo path in a test: the `capture`
// attribute only changes which native picker a real mobile browser opens, not
// the file input's behavior, so this exists to document that both entry
// points reach the same working flow rather than to catch a distinct bug.
test('take picture -> pick primary -> confirm math -> log match', async ({ page }) => {
	await loginAsMax(page);
	await page.goto('/matches/quick-upload');
	await mockScanResponse(page);

	await page.waitForLoadState('networkidle');
	await page.getByLabel('Take Picture', { exact: true }).setInputFiles({
		name: 'score-tracker.png',
		mimeType: 'image/png',
		buffer: sampleScoreTrackerImageBuffer()
	});

	await reviewAndConfirm(page);
	await fillAndSubmitMatchForm(page);
});

test('type score in natural language -> pick primary -> confirm math -> log match', async ({ page }) => {
	await loginAsMax(page);
	await page.goto('/matches/quick-upload');
	await mockScanResponse(page);

	await page.getByRole('button', { name: 'Type your score instead', exact: true }).click();
	await page.getByLabel('Describe your score', { exact: true }).fill('5 crit, 2 kill, 4 tac');
	await page.getByRole('button', { name: 'Parse', exact: true }).click();

	await reviewAndConfirm(page);
	await fillAndSubmitMatchForm(page);
});

test('shows a friendly message once the daily scan cap is hit (demo-mode cookie)', async ({ page }) => {
	// Demo mode's cookie throttle (src/lib/server/scanThrottleCookie.ts) is what
	// this simulates -- real-DB mode ignores this cookie entirely and checks the
	// scanEvent table instead (see the sibling test below), so this only applies
	// when DEMO_MODE is set.
	test.skip(process.env.DEMO_MODE !== 'true', 'exercises the demo-mode cookie throttle specifically');

	await loginAsMax(page);
	await page.goto('/matches/quick-upload');

	// Simulates having already hit today's cap via the real cookie the
	// endpoint reads -- no need to mock /matches/scan here, since the throttle
	// check rejects before any AI call.
	await page.context().addCookies([
		{
			name: 'scan_count',
			value: JSON.stringify({ count: 20, windowStart: Date.now() }),
			url: page.url()
		}
	]);

	await page.waitForLoadState('networkidle');
	await page.getByLabel('Upload Photo', { exact: true }).setInputFiles({
		name: 'score-tracker.png',
		mimeType: 'image/png',
		buffer: sampleScoreTrackerImageBuffer()
	});

	await expect(page.getByText("You've hit today's scan limit — enter these scores manually.")).toBeVisible({
		timeout: 15000
	});
});

test('shows a friendly message once the daily scan cap is hit (real-DB scanEvent)', async ({ page }) => {
	// Mirror of the test above for real-DB mode, where the throttle is a query
	// against scanEvent (src/lib/server/scanThrottle.ts) rather than a cookie.
	// Uses test1 rather than Max -- every other test in this file logs in as
	// Max, and seeding 20 scanEvent rows for that account would throttle every
	// scan attempt those tests make against a shared real Postgres instance.
	test.skip(process.env.DEMO_MODE === 'true', 'exercises the real-DB scanEvent throttle specifically');

	const DATABASE_URL = process.env.DATABASE_URL;
	if (!DATABASE_URL) {
		throw new Error('DATABASE_URL is not set (copy .env.example to .env and fill it in; Playwright loads .env automatically)');
	}
	const client = postgres(DATABASE_URL);
	const db = drizzle(client, { schema });

	const testUser = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.email, TEST1_EMAIL) });
	if (!testUser) throw new Error(`Seeded user ${TEST1_EMAIL} not found`);

	await db.insert(schema.scanEvent).values(
		Array.from({ length: 20 }, () => ({ userId: testUser.id }))
	);

	try {
		await page.goto('/login');
		await page.getByLabel('Email').fill(TEST1_EMAIL);
		await page.getByLabel('Password', { exact: true }).fill(SEED_PASSWORD);
		await page.getByRole('button', { name: 'Login', exact: true }).click();
		await expect(page).toHaveURL(/\/leaderboard/);

		await page.goto('/matches/quick-upload');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Upload Photo', { exact: true }).setInputFiles({
			name: 'score-tracker.png',
			mimeType: 'image/png',
			buffer: sampleScoreTrackerImageBuffer()
		});

		await expect(
			page.getByText("You've hit today's scan limit — enter these scores manually.")
		).toBeVisible({ timeout: 15000 });
	} finally {
		// Leaves test1 clean for any other test/run that logs in as that account.
		await db.delete(schema.scanEvent).where(eq(schema.scanEvent.userId, testUser.id));
		await client.end();
	}
});
