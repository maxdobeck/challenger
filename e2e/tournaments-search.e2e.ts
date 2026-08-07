import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Login as Max', exact: true }).click();
	await expect(page).toHaveURL(/\/leaderboard/);
});

test('pressing Enter loads every tournament matching the search', async ({ page }) => {
	await page.goto('/tournaments');

	const search = page.getByPlaceholder('Search tournaments');
	const resultCount = page.getByTestId('result-count');
	const cards = page.locator('.tournament-card');

	// The result-count element starts with the number of items, e.g. "453 tournaments".
	const readCount = async () =>
		Number(((await resultCount.textContent()) ?? '').trim().split(/\s+/)[0]);

	// Unsearched, the grid is paginated to 50 cards even though there are more.
	await expect(cards).toHaveCount(50);
	const total = await readCount();
	expect(total).toBeGreaterThan(50);

	// Fuzzy-search narrows to the tournaments whose names match.
	await search.fill('Grand Clash');
	await expect.poll(readCount).toBeLessThan(total);
	const matchCount = await readCount();
	expect(matchCount).toBeGreaterThan(0);

	// Pressing Enter loads ALL matching tournaments at once (pagination removed),
	// so the number of rendered cards equals the reported match count.
	await search.press('Enter');
	await expect(cards).toHaveCount(matchCount);
});
