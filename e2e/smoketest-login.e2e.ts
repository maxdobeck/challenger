import { expect, test, type Page } from '@playwright/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	throw new Error('DATABASE_URL is not set (run with e.g. `npm run test:e2e --env-file=.env`)');
}

const SEED_PASSWORD = 'password123';

async function loginAs(page: Page, email: string) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(SEED_PASSWORD);
	await page.getByRole('button', { name: 'Login', exact: true }).click();
}

test('the first 3 seeded users can log in successfully', async ({ page }) => {
	const client = postgres(DATABASE_URL);
	const db = drizzle(client, { schema });

	const users = await db.query.user.findMany({
		orderBy: (u, { asc }) => asc(u.createdAt),
		limit: 3
	});
	await client.end();

	expect(users.length).toBe(3);

	for (const user of users) {
		await loginAs(page, user.email);

		await expect(page).toHaveURL(/\/leaderboard/);
		// Scope to the masthead: the name also appears as a leaderboard row link,
		// so an unscoped exact-text match is ambiguous.
		await expect(page.locator('.site-header').getByText(user.name, { exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page).toHaveURL(/\/login/);
	}
});
