import { expect, test } from '@playwright/test';
import { loginAsMax } from './helpers';

test.beforeEach(async ({ page }) => {
	await loginAsMax(page);
});

test('leaderboard table can be re-sorted by clicking a column header', async ({ page }) => {
	const gamesColumn = page.locator('tbody tr td:nth-child(3)');

	async function gamesValues() {
		return (await gamesColumn.allTextContents()).map(Number);
	}

	// Default sort is by win rate, so games shouldn't already be sorted.
	const initialOrder = await gamesValues();

	await page.getByRole('button', { name: /^Games/ }).click();
	const descOrder = await gamesValues();
	expect(descOrder).not.toEqual(initialOrder);
	expect(descOrder).toEqual([...descOrder].sort((a, b) => b - a));

	await page.getByRole('button', { name: /^Games/ }).click();
	const ascOrder = await gamesValues();
	expect(ascOrder).toEqual([...ascOrder].sort((a, b) => a - b));
	expect(ascOrder).not.toEqual(descOrder);
});

test('hovering a leaderboard row changes its background color', async ({ page }) => {
	const row = page.locator('tbody tr').nth(1);

	const colorBefore = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
	await row.hover();
	await expect(row).toHaveCSS('background-color', 'rgb(128, 0, 128)');
	const colorAfter = await row.evaluate((el) => getComputedStyle(el).backgroundColor);

	expect(colorAfter).not.toBe(colorBefore);
});
