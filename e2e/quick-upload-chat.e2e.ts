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
// (CRIT 5, KILL 2, TAC 4) for the player's own side; the opponent's numbers
// are distinct so a mix-up between the two sides can't pass silently.
const you = scoreScanFixtures[0];
const opponent = { critOp: 3, killOp: 1, tacOp: 2 };

const YOUR_PRIMARY = 'crit' as const;
const OPPONENT_PRIMARY = 'kill' as const;
const yourPrimaryScore = Math.ceil(you.critOp / 2);
const opponentPrimaryScore = Math.ceil(opponent.killOp / 2);

const ASKED_FOR_OPPONENT = 'Got your side. What did your opponent score?';
const ASKED_FOR_PRIMARY = 'Thanks! Which op are you taking as Primary?';
const ASKED_FOR_OPPONENT_PRIMARY = "Got it. And which op is your opponent's Primary?";
const ALL_SET = "All set — here's the final tally.";

function reading(
	values: { critOp: number; killOp: number; tacOp: number },
	primaryOpChoice: string | null
) {
	return { crit: values.critOp, kill: values.killOp, tac: values.tacOp, primaryOpChoice };
}

/**
 * A real conversation answers differently each turn, so this branches on what
 * was actually posted rather than replaying one fixed body: first the player's
 * side alone with the opponent still unknown, then both sides, then each
 * Primary choice as the user answers it. The Primary-choice branches are what
 * prove the quick-reply buttons round-trip through the model rather than
 * flipping local state.
 */
async function mockChat(page: Page) {
	let contentTurns = 0;

	await page.route('**/matches/scan/chat', async (route: Route) => {
		const posted = route.request().postData() ?? '';
		let body: Record<string, unknown>;

		if (posted.includes("My opponent's Primary op is")) {
			body = {
				reply: ALL_SET,
				you: reading(you, YOUR_PRIMARY),
				opponent: reading(opponent, OPPONENT_PRIMARY)
			};
		} else if (posted.includes('My Primary op is')) {
			body = {
				reply: ASKED_FOR_OPPONENT_PRIMARY,
				you: reading(you, YOUR_PRIMARY),
				opponent: reading(opponent, null)
			};
		} else {
			contentTurns += 1;
			body =
				contentTurns === 1
					? { reply: ASKED_FOR_OPPONENT, you: reading(you, null), opponent: null }
					: {
							reply: ASKED_FOR_PRIMARY,
							you: reading(you, null),
							opponent: reading(opponent, null)
						};
		}

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			// history is opaque to the client -- it only stores and resends it,
			// so an empty array is a faithful stand-in here.
			body: JSON.stringify({ ...body, history: [], resumption_token: null })
		});
	});
}

async function sendText(page: Page, text: string) {
	await page.getByLabel('Describe your score', { exact: true }).fill(text);
	await page.getByRole('button', { name: 'Send', exact: true }).click();
}

async function uploadPhoto(page: Page) {
	// Same hydration-timing gotcha as the existing scan test: the file input's
	// change handler only exists once Svelte hydrates.
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Choose File / Take Photo', { exact: true }).setInputFiles({
		name: 'score-tracker.png',
		mimeType: 'image/png',
		buffer: sampleScoreTrackerImageBuffer()
	});
}

// Walks the rest of the conversation once the player's own side is in: supply
// the opponent's numbers, then answer both Primary questions as real turns,
// then confirm. Leaves the caller to submit the underlying form.
async function finishConversation(page: Page) {
	await expect(page.getByText(ASKED_FOR_OPPONENT)).toBeVisible({ timeout: 15000 });
	await expect(page.getByTestId('reading-you')).toContainText(
		`Crit ${you.critOp} · Kill ${you.killOp} · Tac ${you.tacOp}`
	);

	await sendText(page, `my opponent got ${opponent.critOp} crit, ${opponent.killOp} kill, ${opponent.tacOp} tac`);

	await expect(page.getByText(ASKED_FOR_PRIMARY)).toBeVisible({ timeout: 15000 });
	await expect(page.getByTestId('reading-opponent')).toContainText(
		`Crit ${opponent.critOp} · Kill ${opponent.killOp} · Tac ${opponent.tacOp}`
	);

	await page.getByRole('button', { name: 'Your Primary: Crit', exact: true }).click();
	await expect(page.getByText(ASKED_FOR_OPPONENT_PRIMARY)).toBeVisible({ timeout: 15000 });

	await page.getByRole('button', { name: "Opponent's Primary: Kill", exact: true }).click();
	await expect(page.getByText(ALL_SET)).toBeVisible({ timeout: 15000 });

	await page.getByRole('button', { name: 'Confirm', exact: true }).click();
}

// Opponent and both team fields are fuzzy-search comboboxes, not <select>s:
// each renders a hidden input carrying the real form value alongside a text
// input, so scope by the combobox wrapper that holds that hidden input
// (unambiguous, unlike the overlapping "Opponent"/"team" legend/label text)
// and pick the first match from its listbox.
async function selectFirstComboboxOption(page: Page, fieldName: string) {
	const combobox = page.locator('.combobox', { has: page.locator(`input[type="hidden"][name="${fieldName}"]`) });
	await combobox.locator('input[type="text"]').click();
	await combobox.locator('.combobox-option').first().click();
}

async function fillAndSubmitMatchForm(page: Page) {
	await selectFirstComboboxOption(page, 'opponentId');
	await selectFirstComboboxOption(page, 'player1TeamId');
	await selectFirstComboboxOption(page, 'player2TeamId');
	await page.getByRole('button', { name: 'Log match', exact: true }).click();
	await expect(page).toHaveURL(/\/matches$/);
}

async function expectBothSidesOnForm(page: Page) {
	await expect(page.locator('input[name="player1Crit"]')).toHaveValue(String(you.critOp));
	await expect(page.locator('input[name="player1Kill"]')).toHaveValue(String(you.killOp));
	await expect(page.locator('input[name="player1Tac"]')).toHaveValue(String(you.tacOp));
	await expect(page.locator('input[name="player1Primary"]')).toHaveValue(String(yourPrimaryScore));
	await expect(page.locator('input[name="player1PrimaryOpChoice"]')).toHaveValue(YOUR_PRIMARY);

	await expect(page.locator('input[name="player2Crit"]')).toHaveValue(String(opponent.critOp));
	await expect(page.locator('input[name="player2Kill"]')).toHaveValue(String(opponent.killOp));
	await expect(page.locator('input[name="player2Tac"]')).toHaveValue(String(opponent.tacOp));
	// The opponent's Primary Op select is filled by the conversation now, not
	// by the user picking from the dropdown.
	await expect(page.locator('select[name="player2PrimaryOpChoice"]')).toHaveValue(OPPONENT_PRIMARY);
	await expect(page.locator('.derived-score')).toHaveText(String(opponentPrimaryScore));
}

test('photo for your side -> describe opponent -> answer both Primary questions -> log match', async ({
	page
}) => {
	await loginAsMax(page);
	await page.goto('/matches/quick-upload');
	await mockChat(page);

	await uploadPhoto(page);
	await finishConversation(page);
	await expectBothSidesOnForm(page);

	await fillAndSubmitMatchForm(page);
});

test('type both sides in natural language -> answer both Primary questions -> log match', async ({
	page
}) => {
	await loginAsMax(page);
	await page.goto('/matches/quick-upload');
	await mockChat(page);

	await sendText(page, `I got ${you.critOp} crit, ${you.killOp} kill, ${you.tacOp} tac`);
	await finishConversation(page);
	await expectBothSidesOnForm(page);

	await fillAndSubmitMatchForm(page);
});

test('the running reading updates from the same conversation for both sides', async ({ page }) => {
	await loginAsMax(page);
	await page.goto('/matches/quick-upload');
	await mockChat(page);

	await sendText(page, `I got ${you.critOp} crit, ${you.killOp} kill, ${you.tacOp} tac`);

	// One side known, the other explicitly still outstanding -- the model is
	// expected to ask rather than invent the opponent's numbers.
	await expect(page.getByTestId('reading-you')).toContainText(`Crit ${you.critOp}`);
	await expect(page.getByTestId('reading-opponent')).toContainText('Not known yet');

	// The scorecard fills in as the conversation goes, not only at Confirm --
	// so the player's side is already on the form here, while the opponent's
	// fields are untouched rather than zeroed by a half-known turn.
	await expect(page.locator('input[name="player1Crit"]')).toHaveValue(String(you.critOp));
	await expect(page.locator('input[name="player1Kill"]')).toHaveValue(String(you.killOp));
	await expect(page.locator('input[name="player1Tac"]')).toHaveValue(String(you.tacOp));
	// Primary stays 0 until the Primary op is actually answered.
	await expect(page.locator('input[name="player1Primary"]')).toHaveValue('0');
	await expect(page.locator('input[name="player2Crit"]')).toHaveValue('0');

	await sendText(page, `opponent got ${opponent.critOp} crit, ${opponent.killOp} kill, ${opponent.tacOp} tac`);
	await expect(page.getByTestId('reading-opponent')).toContainText(`Crit ${opponent.critOp}`);
	await expect(page.locator('input[name="player2Crit"]')).toHaveValue(String(opponent.critOp));
	await expect(page.locator('input[name="player2Kill"]')).toHaveValue(String(opponent.killOp));
	await expect(page.locator('input[name="player2Tac"]')).toHaveValue(String(opponent.tacOp));

	// Primary is never inferred from what's already known: both sides still
	// need an answer before Confirm shows up.
	await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeHidden();
	await page.getByRole('button', { name: 'Your Primary: Crit', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeHidden();
	// Answering Primary fills the derived Primary score straight away too.
	await expect(page.locator('input[name="player1Primary"]')).toHaveValue(String(yourPrimaryScore));

	await page.getByRole('button', { name: "Opponent's Primary: Kill", exact: true }).click();
	await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();
	await expect(page.locator('select[name="player2PrimaryOpChoice"]')).toHaveValue(OPPONENT_PRIMARY);
});

// ScoreChat.svelte renders a single file input (no `capture` attribute) for
// both desktop and mobile -- the native OS picker is what offers camera vs.
// library on a real mobile browser, not separate inputs. This exercises that
// same single entry point under a mobile user agent to document that it still
// reaches the working flow there.
test.describe('on a mobile browser', () => {
	test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36' });

	test('photo for your side -> describe opponent -> answer both Primary questions -> log match', async ({
		page
	}) => {
		await loginAsMax(page);
		await page.goto('/matches/quick-upload');
		await mockChat(page);

		await uploadPhoto(page);
		await finishConversation(page);
		await fillAndSubmitMatchForm(page);
	});
});

test.describe('at a mobile viewport width', () => {
	// Playwright's `devices` presets (e.g. devices['iPhone 13']) bundle a
	// shrunk viewport with touch support and a mobile user agent; this only
	// needs the viewport shrink to catch layout overflow, so it sets that
	// alone rather than pulling in a full device profile.
	test.use({ viewport: { width: 375, height: 812 } });

	test('quick upload page loads and the Choose File / Take Photo control stays in view', async ({
		page
	}) => {
		await loginAsMax(page);
		await page.goto('/matches/quick-upload');

		await expect(page.getByRole('heading', { name: 'Quick Upload' })).toBeVisible();

		const uploadControl = page.getByLabel('Choose File / Take Photo', { exact: true });
		await expect(uploadControl).toBeVisible();

		const box = await uploadControl.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(375);
	});
});

test('shows a friendly message once the daily scan cap is hit (demo-mode cookie)', async ({
	page
}) => {
	// Demo mode's cookie throttle (src/lib/server/scanThrottleCookie.ts) is what
	// this simulates -- real-DB mode ignores this cookie entirely and checks the
	// scanEvent table instead (see the sibling test below), so this only applies
	// when DEMO_MODE is set.
	test.skip(process.env.DEMO_MODE !== 'true', 'exercises the demo-mode cookie throttle specifically');

	await loginAsMax(page);
	await page.goto('/matches/quick-upload');

	// Simulates having already hit today's cap via the real cookie the
	// endpoint reads -- no need to mock the chat route here, since the throttle
	// check rejects before any AI call.
	await page.context().addCookies([
		{
			name: 'scan_count',
			value: JSON.stringify({ count: 20, windowStart: Date.now() }),
			url: page.url()
		}
	]);

	await uploadPhoto(page);

	await expect(page.getByText("You've hit today's scan limit — enter these scores manually.")).toBeVisible({
		timeout: 15000
	});
});

test('shows a friendly message once the daily scan cap is hit (real-DB scanEvent)', async ({
	page
}) => {
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

	await db.insert(schema.scanEvent).values(Array.from({ length: 20 }, () => ({ userId: testUser.id })));

	try {
		await page.goto('/login');
		await page.getByLabel('Email').fill(TEST1_EMAIL);
		await page.getByLabel('Password', { exact: true }).fill(SEED_PASSWORD);
		await page.getByRole('button', { name: 'Login', exact: true }).click();
		await expect(page).toHaveURL(/\/leaderboard/);

		await page.goto('/matches/quick-upload');
		await uploadPhoto(page);

		await expect(
			page.getByText("You've hit today's scan limit — enter these scores manually.")
		).toBeVisible({ timeout: 15000 });
	} finally {
		// Leaves test1 clean for any other test/run that logs in as that account.
		await db.delete(schema.scanEvent).where(eq(schema.scanEvent.userId, testUser.id));
		await client.end();
	}
});
