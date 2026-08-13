import { expect, test, type Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { signOut } from './helpers';
import { STATIC_USER } from '../src/lib/server/db/demo-fixtures';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

// Registration writes a real row, so every run needs an address no previous run
// used. New accounts have no matches, so they never show up on the leaderboard
// or perturb the other suites — they just accumulate in a long-lived dev
// database, which is harmless (CI's Postgres is thrown away each run).
const uniqueEmail = () => `e2e-${faker.string.uuid()}@challenger.example.com`;

const VALID_PASSWORD = 'password123';

async function fillRegistration(
	page: Page,
	fields: { name: string; email: string; password: string; confirmPassword: string }
) {
	await page.getByLabel('Name', { exact: true }).fill(fields.name);
	await page.getByLabel('Email', { exact: true }).fill(fields.email);
	// `exact` matters on both: 'Password' alone also matches 'Confirm password'.
	await page.getByLabel('Password', { exact: true }).fill(fields.password);
	await page.getByLabel('Confirm password', { exact: true }).fill(fields.confirmPassword);
}

const headerLink = (page: Page, name: string) =>
	page.locator('.site-header').getByRole('link', { name, exact: true });

test.describe('registration', () => {
	test.skip(DEMO_MODE, 'creates real accounts, N/A in demo mode');

	test('the masthead offers Login off the login page and Register on it', async ({ page }) => {
		await page.goto('/');
		await expect(headerLink(page, 'Login')).toBeVisible();
		await expect(headerLink(page, 'Register')).toHaveCount(0);

		await page.goto('/login');
		await expect(headerLink(page, 'Register')).toBeVisible();
		await expect(headerLink(page, 'Login')).toHaveCount(0);
	});

	test('a new account can register and lands signed in', async ({ page }) => {
		const name = faker.person.fullName();

		await page.goto('/login');
		await headerLink(page, 'Register').click();
		await expect(page).toHaveURL(/\/register/);

		await fillRegistration(page, {
			name,
			email: uniqueEmail(),
			password: VALID_PASSWORD,
			confirmPassword: VALID_PASSWORD
		});
		await page.getByRole('button', { name: 'Create account', exact: true }).click();

		await expect(page).toHaveURL(/\/leaderboard/);
		// Scope to the masthead: a name can also appear in a leaderboard row.
		await expect(page.locator('.site-header').getByText(name, { exact: true })).toBeVisible();

		// Proves the signup produced a real session rather than just a redirect.
		await signOut(page);
	});

	test('mismatched passwords are caught before the form is submitted', async ({ page }) => {
		await page.goto('/register');

		await fillRegistration(page, {
			name: faker.person.fullName(),
			email: uniqueEmail(),
			password: VALID_PASSWORD,
			confirmPassword: 'something-else'
		});
		await page.getByRole('button', { name: 'Create account', exact: true }).click();

		await expect(page.getByText('Passwords do not match.')).toBeVisible();
		await expect(page).toHaveURL(/\/register/);

		// Correcting the field clears the message without a round trip.
		await page.getByLabel('Confirm password', { exact: true }).fill(VALID_PASSWORD);
		await expect(page.getByText('Passwords do not match.')).toHaveCount(0);
	});

	test('a password of 8 characters is rejected as too short', async ({ page }) => {
		await page.goto('/register');

		await fillRegistration(page, {
			name: faker.person.fullName(),
			email: uniqueEmail(),
			password: '12345678',
			confirmPassword: '12345678'
		});
		await page.getByRole('button', { name: 'Create account', exact: true }).click();

		await expect(page.getByText('Password must be more than 8 characters.')).toBeVisible();
		await expect(page).toHaveURL(/\/register/);
	});

	test('an email without a top-level domain is rejected', async ({ page }) => {
		await page.goto('/register');

		await fillRegistration(page, {
			name: faker.person.fullName(),
			email: 'somebody@challenger',
			password: VALID_PASSWORD,
			confirmPassword: VALID_PASSWORD
		});
		await page.getByRole('button', { name: 'Create account', exact: true }).click();

		await expect(
			page.getByText('Enter a valid email address, including a domain like example.com.')
		).toBeVisible();
		await expect(page).toHaveURL(/\/register/);
	});

	test('registering an existing email reports it under the email field', async ({ page }) => {
		const name = faker.person.fullName();

		await page.goto('/register');
		await fillRegistration(page, {
			name,
			email: STATIC_USER.email,
			password: VALID_PASSWORD,
			confirmPassword: VALID_PASSWORD
		});
		await page.getByRole('button', { name: 'Create account', exact: true }).click();

		// This is what proves the better-auth APIError is mapped onto a field
		// rather than dumped into the generic banner.
		await expect(
			page.getByText('That email is already registered. Try logging in instead.')
		).toBeVisible();
		await expect(page).toHaveURL(/\/register/);

		// A rejected submission keeps what was typed rather than emptying the form.
		await expect(page.getByLabel('Name', { exact: true })).toHaveValue(name);
		await expect(page.getByLabel('Email', { exact: true })).toHaveValue(STATIC_USER.email);
	});

	test('the server validates a submission that never went through the page', async ({ page }) => {
		// The client-side gate means no browser-driven test can reach the server's
		// own validation, so post the form directly the way a JS-less browser would.
		await page.goto('/register');
		// Two headers a real browser form post sends and page.request does not:
		// without a matching Origin SvelteKit rejects the post as cross-site (403),
		// and without an HTML Accept it answers with a JSON ActionResult instead of
		// re-rendering the page. The origin is read off the page rather than
		// hardcoded so this doesn't break if the preview port changes.
		const origin = new URL(page.url()).origin;

		const submittedPassword = 'short';
		const response = await page.request.post('/register', {
			headers: { origin, accept: 'text/html' },
			form: { name: '', email: 'nope', password: submittedPassword, confirmPassword: 'other' }
		});

		expect(response.status()).toBe(400);
		const body = await response.text();
		expect(body).toContain('Enter your name.');
		expect(body).toContain('Enter a valid email address');
		// The re-rendered form echoes the name and email back, never the passwords.
		expect(body).not.toContain(submittedPassword);
	});
});

test.describe('registration in demo mode', () => {
	test.skip(!DEMO_MODE, 'describes demo-mode-only behaviour');

	test('registration is unreachable and unadvertised', async ({ page }) => {
		// Demo users are a frozen in-memory dataset with no database behind them,
		// so /register bounces to the page that does work.
		await page.goto('/register');
		await expect(page).toHaveURL(/\/login/);

		await expect(headerLink(page, 'Login')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Register', exact: true })).toHaveCount(0);

		await page.goto('/');
		await expect(page.getByRole('link', { name: 'Register', exact: true })).toHaveCount(0);
	});
});
