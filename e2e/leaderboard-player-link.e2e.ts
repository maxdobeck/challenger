import { expect, test } from '@playwright/test';
import { loginAsMax } from './helpers';

test.beforeEach(async ({ page }) => {
	await loginAsMax(page);
});

test('clicking a player name on the leaderboard opens their stats page', async ({ page }) => {
	const otherPlayerRow = page.locator('tbody tr').filter({ hasNotText: '(you)' }).first();
	const playerLink = otherPlayerRow.getByRole('link');
	const playerName = await playerLink.textContent();

	await playerLink.click();

	await expect(page).toHaveURL(/\/stats\?user=/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${playerName} Stats`);
});
