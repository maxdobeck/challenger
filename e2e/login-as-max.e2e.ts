import { expect, test } from '@playwright/test';

test('the demo-account dropdown selects who the "Login as" button signs in', async ({ page }) => {
	// Works in both modes: /login always renders the form and dropdown, and
	// picking an account signs in for real (better-auth in DB mode, a demo
	// session cookie in demo mode) rather than a hardcoded auto-login.
	await page.goto('/login');

	// Defaults to the first curated account (Max).
	await expect(page.getByRole('button', { name: 'Login as Max', exact: true })).toBeVisible();

	// Selecting another account in the dropdown re-labels the button and changes
	// who gets signed in.
	await page.getByText('Log in as a demo account', { exact: true }).click();
	await page.getByRole('button', { name: 'Select Kaelen Voss' }).click();
	await page.getByRole('button', { name: 'Login as Kaelen', exact: true }).click();

	await expect(page).toHaveURL(/\/leaderboard/);
	await expect(page.locator('.site-header')).toContainText('Kaelen Voss');
	await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});
