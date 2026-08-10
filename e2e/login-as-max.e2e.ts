import { expect, test } from '@playwright/test';

test('the demo-account dropdown selects who the "Login as" button signs in', async ({ page }) => {
	// Demo mode auto-authenticates as Max (no login form, no Sign out button —
	// a "DEMO MODE" badge replaces it), so this real-auth flow doesn't apply.
	test.skip(process.env.DEMO_MODE === 'true', 'real-auth login flow: N/A in demo mode');

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
