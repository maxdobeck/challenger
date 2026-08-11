import { expect, test } from '@playwright/test';
import {
	DEMO_LOGIN_ACCOUNTS,
	CASUAL_PLAYERS,
	killteamEmail
} from '../src/lib/server/db/demo-fixtures';
import { signOut } from './helpers';

// DEMO_LOGIN_ACCOUNTS is the single curated list behind the login page's
// "demo account" dropdown in both modes: real DB accounts (seeded via
// `npm run db:seed`) in real-auth mode, in-memory demo identities (see
// $lib/server/demo/data.ts) in demo mode. Driving login purely through that
// dropdown + "Login as ..." button — rather than typing email/password —
// means this test needs no direct DB access and passes in either mode.
test.describe('logging in as each of the curated demo accounts', () => {
	test('the curated list is well-formed and reaches every experiment-eligible account', () => {
		// 3 fixed accounts + 12 FAKE_PLAYERS + every CASUAL_PLAYER.
		expect(DEMO_LOGIN_ACCOUNTS.length).toBe(15 + CASUAL_PLAYERS.length);

		const challengerDomainAccounts = DEMO_LOGIN_ACCOUNTS.filter((a) =>
			a.email.toLowerCase().endsWith('@challenger.example.com')
		);
		expect(challengerDomainAccounts.length).toBeGreaterThanOrEqual(2);

		// Every casual player must be selectable from the dropdown: they're the
		// only accounts the `social-matchmake-cta` experiment can enrol, so
		// dropping them would leave no way to demo the "Matchmake Now!" button.
		const casualEmails = new Set(CASUAL_PLAYERS.map(killteamEmail));
		const casualInDropdown = DEMO_LOGIN_ACCOUNTS.filter((a) => casualEmails.has(a.email));
		expect(casualInDropdown.length).toBe(CASUAL_PLAYERS.length);

		// The "Login as <firstName>" button is addressed by first name, so those
		// must stay unique across the list or the locator goes ambiguous.
		const firstNames = DEMO_LOGIN_ACCOUNTS.map((a) => a.name.split(' ')[0]);
		expect(new Set(firstNames).size).toBe(firstNames.length);
	});

	for (const account of DEMO_LOGIN_ACCOUNTS) {
		test(`logs in as ${account.name} (${account.email})`, async ({ page }) => {
			await page.goto('/login');

			// Max is the default-selected account, so the dropdown only needs
			// opening for everyone else.
			if (account.email !== DEMO_LOGIN_ACCOUNTS[0].email) {
				await page.getByText('Log in as a demo account', { exact: true }).click();
				await page.getByRole('button', { name: `Select ${account.name}` }).click();
			}
			const firstName = account.name.split(' ')[0];
			await page.getByRole('button', { name: `Login as ${firstName}`, exact: true }).click();

			await expect(page).toHaveURL(/\/leaderboard/);
			// Scope to the masthead: the name also appears as a leaderboard row
			// link, so an unscoped exact-text match is ambiguous.
			await expect(
				page.locator('.site-header').getByText(account.name, { exact: true })
			).toBeVisible();

			await signOut(page);
		});
	}
});
