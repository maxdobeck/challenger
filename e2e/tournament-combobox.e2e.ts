import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Login as Max', exact: true }).click();
	await expect(page).toHaveURL(/\/leaderboard/);
});

test('tournament combobox fuzzy-searches by name as you type', async ({ page }) => {
	await page.goto('/matches');

	// Scoped to our widget's classes: native <select>s on this page also expose
	// the combobox/option ARIA roles, so class locators keep this unambiguous.
	const input = page.getByPlaceholder('Search tournaments');
	const options = page.locator('.combobox-option');

	// Open the dropdown (an empty query lists every tournament) and take the
	// first tournament in the list as our target.
	await input.click();
	await expect(options.first()).toBeVisible();
	const targetName = ((await options.first().textContent()) ?? '').trim();
	expect(targetName.length).toBeGreaterThanOrEqual(4);

	// Type only the first 4 characters of that tournament's name.
	await input.fill(targetName.slice(0, 4));

	// The fuzzy search should still surface the matching tournament by name.
	const match = options.filter({ hasText: targetName }).first();
	await match.scrollIntoViewIfNeeded();
	await expect(match).toBeVisible();
});
