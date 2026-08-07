import { expect, test } from '@playwright/test';

test('the "Login as Max" button logs the user in as Max', async ({ page }) => {
	// Demo mode auto-authenticates as Max (no login form, no Sign out button —
	// a "DEMO MODE" badge replaces it), so this real-auth flow doesn't apply.
	test.skip(process.env.DEMO_MODE === 'true', 'real-auth login flow: N/A in demo mode');

	await page.goto('/login');
	await page.getByRole('button', { name: 'Login as Max', exact: true }).click();

	await expect(page).toHaveURL(/\/leaderboard/);
	await expect(page.locator('.site-header')).toContainText('Max');
	await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});
