import { expect, test } from '@playwright/test';
import { DEMO_LOGIN_ACCOUNTS } from '../src/lib/server/db/demo-fixtures';
import { signOut } from './helpers';

// DEMO_LOGIN_ACCOUNTS is the single curated list behind the login page's
// "demo account" dropdown in both modes: real DB accounts (seeded via
// `npm run db:seed`) in real-auth mode, in-memory demo identities (see
// $lib/server/demo/data.ts) in demo mode. Driving login purely through that
// dropdown + "Login as ..." button — rather than typing email/password —
// means this test needs no direct DB access and passes in either mode.
test.describe('logging in as each of the 15 curated demo accounts', () => {
	test('the curated list has 15 accounts, at least 2 on the challenger.example.com domain', () => {
		expect(DEMO_LOGIN_ACCOUNTS.length).toBe(15);
		const challengerDomainAccounts = DEMO_LOGIN_ACCOUNTS.filter((a) =>
			a.email.toLowerCase().endsWith('@challenger.example.com')
		);
		expect(challengerDomainAccounts.length).toBeGreaterThanOrEqual(2);
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
