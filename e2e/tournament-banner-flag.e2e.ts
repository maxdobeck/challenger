import { expect, test, type Page } from '@playwright/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, count, eq, isNotNull, or } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema';
import { match, userProfile } from '../src/lib/server/db/schema';
import { TEST_USER, TOURNEY_USER } from '../src/lib/server/db/demo-fixtures';

// The masthead promo banner is gated purely on the LaunchDarkly `tourneys-in-area`
// flag (see src/routes/+layout.svelte). These tests exercise the *live* LD
// integration to prove the flag — not the user's own tournament history — is what
// controls the banner. The flag is deliberately misconfigured for the demo, serving
// the opposite of what its name and the banner copy imply:
//   - test1 has NEVER played a tournament, yet the flag serves TRUE  -> sees banner
//   - testTourney HAS played many tournaments, yet the flag serves FALSE -> no banner
//
// Preconditions (both are real-auth + live-LD; they skip themselves otherwise):
//   - A seeded Postgres DB (run `npm run db:seed`) — demo mode has no DB.
//   - PUBLIC_LD_CLIENT_ID set (Playwright loads it from .env) so the browser
//     actually evaluates flags against LaunchDarkly.
//   - The `tourneys-in-area` flag configured in LD to serve true for test1 and
//     false for testTourney (per the targeting above).

const SEED_PASSWORD = 'password123';

// Exact literal copy the banner renders — intentionally uninterpolated.
const BANNER_TEXT = '{num_tournaments} near you in {nearby_tourn_loc}!';

function connectDb() {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error(
			'DATABASE_URL is not set (copy .env.example to .env and fill it in; Playwright loads .env automatically)'
		);
	}
	const client = postgres(url);
	return { client, db: drizzle(client, { schema }) };
}

async function loginAs(page: Page, email: string) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(SEED_PASSWORD);
	await page.getByRole('button', { name: 'Login', exact: true }).click();
	await expect(page).toHaveURL(/\/leaderboard/);
}

// Waits until the LD client has identified the given user, i.e. the `flags`
// store reflects that user's context and not the anonymous one. The layout
// mirrors this into the header's data-ld-context attribute.
async function waitForLdIdentify(page: Page, userId: string) {
	await expect(page.locator('.site-header')).toHaveAttribute('data-ld-context', userId, {
		timeout: 15000
	});
}

const banner = (page: Page) => page.getByRole('heading', { name: BANNER_TEXT, exact: true });

test.describe('promo banner is gated on the LaunchDarkly flag, not tournament history', () => {
	test.skip(process.env.DEMO_MODE === 'true', 'requires a seeded database, N/A in demo mode');
	test.skip(
		!process.env.PUBLIC_LD_CLIENT_ID,
		'requires a live LaunchDarkly client (PUBLIC_LD_CLIENT_ID)'
	);

	test('testTourney (has played multiple tournaments) does NOT see the banner', async ({
		page
	}) => {
		const { client, db } = connectDb();
		try {
			// better-auth normalizes emails to lowercase on sign-up, so match on that.
			const user = await db.query.user.findFirst({
				where: (u, { eq }) => eq(u.email, TOURNEY_USER.email.toLowerCase())
			});
			if (!user) {
				throw new Error(`${TOURNEY_USER.email} not found — run \`npm run db:seed\` first`);
			}

			// Precondition: this account genuinely has a multi-tournament history, so a
			// missing banner can only be the flag's doing, not a lack of qualification.
			const [{ profileHasPlayed }] = await db
				.select({ profileHasPlayed: userProfile.hasPlayedTournament })
				.from(userProfile)
				.where(eq(userProfile.userId, user.id));
			const isPlayer = or(eq(match.player1Id, user.id), eq(match.player2Id, user.id));
			const [{ tournamentMatches }] = await db
				.select({ tournamentMatches: count() })
				.from(match)
				.where(and(isNotNull(match.tournamentId), isPlayer));
			expect(profileHasPlayed).toBe(true);
			expect(tournamentMatches).toBeGreaterThan(1);

			await loginAs(page, TOURNEY_USER.email);
			// Wait until the flag has been evaluated for testTourney specifically,
			// so "no banner" reflects the identified user's flag value.
			await waitForLdIdentify(page, user.id);

			await expect(banner(page)).toHaveCount(0);
		} finally {
			await client.end();
		}
	});

	test('test1 (never played a tournament) DOES see the banner', async ({ page }) => {
		const { client, db } = connectDb();
		try {
			const user = await db.query.user.findFirst({
				where: (u, { eq }) => eq(u.email, TEST_USER.email.toLowerCase())
			});
			if (!user) {
				throw new Error(`${TEST_USER.email} not found — run \`npm run db:seed\` first`);
			}

			await loginAs(page, TEST_USER.email);
			await waitForLdIdentify(page, user.id);

			// The flag serves true for test1, so the (intentionally broken) banner shows.
			await expect(banner(page)).toBeVisible();
			await expect(banner(page)).toHaveText(BANNER_TEXT);
		} finally {
			await client.end();
		}
	});
});
