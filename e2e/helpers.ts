import { expect, type Page } from '@playwright/test';

// Logs in as Max and lands on the leaderboard, working in both modes:
//   - Real DB: /login renders the form; click the "Login as Max" shortcut.
//   - Demo mode: every request is auto-authenticated as Max, so /login
//     redirects straight to /leaderboard and there's no button to click.
export async function loginAsMax(page: Page) {
	await page.goto('/login');
	if (new URL(page.url()).pathname.startsWith('/login')) {
		await page.getByRole('button', { name: 'Login as Max', exact: true }).click();
	}
	await expect(page).toHaveURL(/\/leaderboard/);
}
