import { expect, test } from '@playwright/test';
import { loginAsMax } from './helpers';

test.beforeEach(async ({ page }) => {
	await loginAsMax(page);
});

test('a tournament card links to its detail page showing the same title', async ({ page }) => {
	await page.goto('/tournaments');

	// Grab the first card and its h3 title.
	const firstCard = page.locator('a.tournament-card').first();
	const title = ((await firstCard.locator('h3').textContent()) ?? '').trim();
	expect(title.length).toBeGreaterThan(0);

	await firstCard.click();

	// The URL changes to the detail route and the page loads with the same title
	// rendered as the h1 in the tournaments head.
	await expect(page).toHaveURL(/\/tournaments\/\d+$/);
	await expect(page.locator('.tournaments-head h1')).toHaveText(title);
});
