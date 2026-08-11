import { expect, test, type Locator } from '@playwright/test';
import {
	STATIC_USER,
	TEST_USER,
	TOURNEY_USER,
	FAKE_PLAYERS,
	killteamEmail,
	DEMO_LOGIN_PASSWORD
} from '../src/lib/server/db/demo-fixtures';
import { signOut } from './helpers';

// Every login-capable account in either mode: the 3 fixed accounts plus all
// of FAKE_PLAYERS (seeded by seed.ts in real-auth mode, and mirrored 1:1 in
// demo mode's in-memory dataset — see src/lib/server/demo/data.ts). This is a
// superset of the 15 curated DEMO_LOGIN_ACCOUNTS shown in the /login
// dropdown: signing in through the email/password form accepts any of these
// 51 in both modes (see the signInEmail action in
// src/routes/login/+page.server.ts), not just the curated ones.
const ALL_ACCOUNTS: ReadonlyArray<{ name: string; email: string }> = [
	STATIC_USER,
	TEST_USER,
	TOURNEY_USER,
	...FAKE_PLAYERS.map((name) => ({ name, email: killteamEmail(name) }))
];

// Number of accounts to log in as per run. There are 51 login-capable
// accounts total; sampling a small subset (rather than all 51) keeps the
// suite fast while still exercising a fresh random selection every run.
const SAMPLE_SIZE = 10;

// Seeded so every import of this file within one run picks the SAME 10
// accounts. Playwright imports test files once to list tests and again in
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
// configured -- it's always absent in demo mode (no LD client at all) and may
// be off even against a live client. Rather than requiring a specific flag
// state, this checks for the button before interacting with it, so the test
// passes either way while still exercising the click whenever it's present.
async function clickIfPresent(button: Locator) {
	try {
		await button.waitFor({ state: 'visible', timeout: 1000 });
	} catch {
		return false;
	}
	await button.click();
	return true;
}

test.describe('random users click Matchmake Now', () => {
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

			const matchmakeButton = page.getByRole('button', { name: 'Matchmake Now!', exact: true });
			await clickIfPresent(matchmakeButton);
			// Clicking only records an observability error client-side -- it never
			// navigates or throws -- so the page should still be right where we left it.
			await expect(page).toHaveURL(/\/leaderboard/);

			await signOut(page);

			expect(pageErrors).toEqual([]);
		});
	}
});
