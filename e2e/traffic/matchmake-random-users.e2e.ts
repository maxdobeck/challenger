import { expect, test } from '@playwright/test';
import {
	STATIC_USER,
	TEST_USER,
	TOURNEY_USER,
	HEAVY_TOURNEY_USER,
	FAKE_PLAYERS,
	CASUAL_PLAYERS,
	killteamEmail,
	DEMO_LOGIN_PASSWORD
} from '../../src/lib/server/db/demo-fixtures';
import { signOut, waitForLdIdentified } from '../helpers';

// Every login-capable account in either mode: the 4 fixed accounts plus all
// of FAKE_PLAYERS (seeded by seed.ts in real-auth mode, and mirrored 1:1 in
// demo mode's in-memory dataset — see src/lib/server/demo/data.ts). This is a
// superset of the curated DEMO_LOGIN_ACCOUNTS shown in the /login
// dropdown: signing in through the email/password form accepts any of these
// in both modes (see the signInEmail action in
// src/routes/login/+page.server.ts), not just the curated ones.
//
// CASUAL_PLAYERS matter most for traffic generation: they never attend
// tournaments, so they're the bulk of the `non-tournament-players` segment the
// `social-matchmake-cta` experiment targets. FAKE_PLAYERS almost all pick up a
// tournament match and are therefore excluded from the experiment.
const ALL_ACCOUNTS: ReadonlyArray<{ name: string; email: string }> = [
	STATIC_USER,
	TEST_USER,
	TOURNEY_USER,
	HEAVY_TOURNEY_USER,
	...FAKE_PLAYERS.map((name) => ({ name, email: killteamEmail(name) })),
	...CASUAL_PLAYERS.map((name) => ({ name, email: killteamEmail(name) }))
];

// Number of accounts to log in as per run. There are 72 login-capable
// accounts total; sampling a subset (rather than all of them) keeps the suite
// fast while still exercising a fresh random selection every run.
//
// Sized for traffic generation: only the 22 CASUAL_PLAYERS/Max/test1 accounts
// are eligible for the `social-matchmake-cta` experiment, and roughly half of
// those are bucketed into the variation that shows the button, so a draw of 25
// yields ~8 enrolled subjects and ~4 clicks per run.
const SAMPLE_SIZE = 25;

// Seeded so every import of this file within one run picks the SAME accounts.
// Playwright imports test files once to list tests and again in
// each worker; an unseeded Math.random() would sample differently each time
// and the workers would fail with "Test not found in the worker process".
// e2e/global-setup.ts sets a fresh seed per run, so the selection still
// varies run to run.
function seededRandom(seed: number): () => number {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function randomSample<T>(items: readonly T[], size: number): T[] {
	const rng = seededRandom(Number(process.env.MATCHMAKE_SEED ?? 1));
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy.slice(0, size);
}

// The "Matchmake Now!" button (leaderboard/+page.svelte, stats/+page.svelte)
// is gated on the live `social-matchmake` LD flag, so whether it renders
// depends on that flag's targeting for whichever LD environment is
// configured -- it's served to only a slice of contexts, in demo mode as well
// as real-auth mode. Rather than requiring a specific flag
// state, this checks for the button before interacting with it, so the test
// passes either way while still exercising the click whenever it's present.
//
// This doubles as a LaunchDarkly traffic generator. Each test is its own
// browser context, so every account runs a fresh anonymous -> identified
// lifecycle, and reading the flag through variation() (see
// $lib/stores/launchdarkly) enrols that context as a subject of the
// `social-matchmake-cta` experiment. The click then feeds the
// `matchmake-click-rate` click metric, which LD's goals instrumentation
// matches on `#matchmake-now` under /leaderboard.
//
// LD_TRAFFIC=1 makes generating that traffic the *point* of the run, and
// asserts the one precondition that is actually deterministic: that LD is
// configured and identifying users. That catches the silent failure mode --
// PUBLIC_LD_CLIENT_ID unset, so initLD() no-ops and the run sends nothing
// while still passing green.
//
// It deliberately does NOT require the button to appear. The experiment
// allocates 25% true / 25% false / 50% untracked *within* the
// `non-tournament-players` segment, so most sampled accounts will correctly
// see no button. Asserting otherwise would fail on correct behaviour.
const STRICT = process.env.LD_TRAFFIC === '1';

// The SDK batches analytics events, so give it room to flush before signOut
// and context teardown drop them on the floor.
const EVENT_FLUSH_MS = 2500;

test.describe('random users click Matchmake Now', { tag: '@traffic' }, () => {
	for (const account of randomSample(ALL_ACCOUNTS, SAMPLE_SIZE)) {
		test(`${account.name} (${account.email}) clicks Matchmake Now if it is shown`, async ({
			page
		}) => {
			const pageErrors: Error[] = [];
			page.on('pageerror', (err) => pageErrors.push(err));

			await page.goto('/login');
			await page.getByLabel('Email').fill(account.email);
			await page.getByLabel('Password').fill(DEMO_LOGIN_PASSWORD);
			await page.getByRole('button', { name: 'Login', exact: true }).click();
			await expect(page).toHaveURL(/\/leaderboard/);

			// Wait for the identified context before looking for the flag-gated
			// button, so a slow identify() isn't mistaken for "the flag is off".
			const identified = await waitForLdIdentified(page);
			if (STRICT) {
				expect(identified, 'LaunchDarkly never identified the user -- no traffic generated').toBe(
					true
				);
			}

			const matchmakeButton = page.getByRole('button', { name: 'Matchmake Now!', exact: true });
			const shown = await matchmakeButton.isVisible();
			if (shown) {
				await matchmakeButton.click();
				await page.waitForTimeout(EVENT_FLUSH_MS);
			}

			// Clicking only records an observability error client-side -- it never
			// navigates or throws -- so the page should still be right where we left it.
			await expect(page).toHaveURL(/\/leaderboard/);

			await signOut(page);

			expect(pageErrors).toEqual([]);
		});
	}
});
