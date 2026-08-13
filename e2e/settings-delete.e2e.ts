import { expect, test } from '@playwright/test';
import { loginAsMax } from './helpers';

// Registers a fresh, disposable account through the same UI path signUpEmail
// already supports for both modes: a real better-auth user in DB mode, or a
// self-registered (password-checked, individually deletable) demo identity in
// demo mode — never one of the shared curated fixtures like Max.
async function registerDisposableAccount(page: import('@playwright/test').Page) {
	const email = `e2e-delete-${Date.now()}@example.com`;
	const password = 'TestPassw0rd!';

	await page.goto('/login');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.locator('input[name="name"]').fill('E2E Delete Me');
	await page.getByRole('button', { name: 'Register' }).click();

	// Registration succeeded and signed us in — this proves the account exists.
	await expect(page).toHaveURL(/\/leaderboard/);

	return { email, password };
}

test('the delete button stays disabled until both confirmations are met, then deleting the account removes it', async ({
	page
}) => {
	await registerDisposableAccount(page);
	await page.goto('/settings');

	const deleteButton = page.getByRole('button', { name: 'Delete my data' });
	await expect(deleteButton).toBeDisabled();

	await page.getByLabel('Type delete to confirm').fill('delete');
	await expect(deleteButton).toBeDisabled(); // text alone isn't enough

	await page.getByLabel(/I understand this is permanent/).check();
	await expect(deleteButton).toBeEnabled(); // both conditions now met

	// Wrong case no longer satisfies the exact-match requirement.
	await page.getByLabel('Type delete to confirm').fill('Delete');
	await expect(deleteButton).toBeDisabled();

	await page.getByLabel('Type delete to confirm').fill('delete');
	await expect(deleteButton).toBeEnabled();
	await deleteButton.click();

	await expect(page).toHaveURL(/\/login\?deleted=1/);
	await expect(page.getByText('Your account and data have been deleted.')).toBeVisible();
});

test('a deleted account can no longer log in', async ({ page }) => {
	const { email, password } = await registerDisposableAccount(page);

	await page.goto('/settings');
	await page.getByLabel('Type delete to confirm').fill('delete');
	await page.getByLabel(/I understand this is permanent/).check();
	await page.getByRole('button', { name: 'Delete my data' }).click();
	await expect(page).toHaveURL(/\/login\?deleted=1/);

	// The account is really gone: signing back in with the same credentials fails.
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Login', exact: true }).click();
	await expect(page.locator('.error')).toBeVisible();
});

test('the shared curated demo account cannot be deleted', async ({ page }) => {
	test.skip(process.env.DEMO_MODE !== 'true', 'demo-mode-only protection for curated fixtures');

	await loginAsMax(page);
	await page.goto('/settings');

	await expect(page.getByText("This is a shared demo account and can't be deleted")).toBeVisible();
	await expect(page.getByRole('button', { name: 'Delete my data' })).toHaveCount(0);
});
