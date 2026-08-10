import { expect, test } from '@playwright/test';
import { loginAsMax, signOut } from './helpers';

// Demo mode used to hardcode every request to a fixed user with no session at
// all — the header showed a "Demo Mode" badge instead of a Sign out button,
// since there was nothing to sign out of. Now that demo mode has a real
// (cookie-backed) session like the DB-backed mode does, this checks the
// button exists and actually ends the session in both modes.
test('the Sign out button is present after login and actually signs the user out', async ({
	page
}) => {
	await loginAsMax(page);
	await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();

	await signOut(page);

	// Signed out: the logged-in-only nav is gone, and a protected route bounces
	// back to /login instead of loading.
	await expect(page.locator('.site-subnav')).toHaveCount(0);
	await page.goto('/leaderboard');
	await expect(page).toHaveURL(/\/login/);
});
