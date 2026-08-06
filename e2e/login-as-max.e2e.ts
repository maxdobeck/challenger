import { expect, test } from '@playwright/test';

test('the "Login as Max" button logs the user in as Max', async ({ page }) => {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Login as Max', exact: true }).click();

	await expect(page).toHaveURL(/\/leaderboard/);
	await expect(page.locator('.site-header')).toContainText('Max');
	await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});
