import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Login as Max', exact: true }).click();
	await expect(page).toHaveURL(/\/leaderboard/);
});

test('clicking a player name on the leaderboard opens their stats page', async ({ page }) => {
	const otherPlayerRow = page.locator('tbody tr').filter({ hasNotText: '(you)' }).first();
	const playerLink = otherPlayerRow.getByRole('link');
	const playerName = await playerLink.textContent();

	await playerLink.click();

	await expect(page).toHaveURL(/\/stats\?user=/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${playerName} Stats`);
});
