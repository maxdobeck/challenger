import { expect, test } from '@playwright/test';
import { DEMO_LOGIN_ACCOUNTS } from '../../src/lib/server/db/demo-fixtures';
import { signOut } from '../helpers';

// Drives login for every curated demo account purely through the /login
// dropdown + "Login as ..." button -- rather than typing email/password --
// so this needs no direct DB access and passes in either mode. See
// e2e/login-demo-accounts.e2e.ts for the (fast, default-suite) check that the
// underlying list is well-formed.
//
// Exhaustively logging in as all 35 accounts is mostly the same check
// repeated: real coverage value beyond a couple of spot checks is low, so
// this is tagged @traffic and excluded from the default suite (see
// package.json's test:e2e) -- run deliberately with `npm run test:e2e:traffic`.
test.describe('logging in as each of the curated demo accounts', { tag: '@traffic' }, () => {
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
