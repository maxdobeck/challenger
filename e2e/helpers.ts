import { expect, type Page } from '@playwright/test';

// Logs in as Max and lands on the leaderboard. Works the same way in both
// modes: /login always renders the form and Max is the default-selected
// "demo account", so the "Login as Max" shortcut signs in against real
// better-auth in DB mode, or sets the demo session cookie directly in demo
// mode (see src/routes/login/+page.server.ts) — no bypass either way.
export async function loginAsMax(page: Page) {
	await page.goto('/login');
	if (new URL(page.url()).pathname.startsWith('/login')) {
		await page.getByRole('button', { name: 'Login as Max', exact: true }).click();
	}
	await expect(page).toHaveURL(/\/leaderboard/);
}

// Signs out via the header button and lands back on /login. Works in both
// modes now that demo mode has a real (cookie-backed) session to clear.
export async function signOut(page: Page) {
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page).toHaveURL(/\/login/);
}
