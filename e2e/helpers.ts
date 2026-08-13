import { expect, type Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { drizzle } from 'drizzle-orm/postgres-js';
import { inArray, like } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema';

// Every account a test creates is addressed `e2e-<uuid>@challenger.example.com`.
// The prefix is the contract between newE2eEmail() and the two cleanup routines
// below, which is why all three live together: the sweep's LIKE pattern has to
// keep matching whatever the generator produces, and nothing seeded looks like
// this (fixtures use max@killteam.example, test1@…, and killteamEmail() names).
const E2E_EMAIL_PREFIX = 'e2e-';
const E2E_EMAIL_DOMAIN = '@challenger.example.com';

/** A registration address no previous run can have used. */
export function newE2eEmail() {
	return `${E2E_EMAIL_PREFIX}${faker.string.uuid()}${E2E_EMAIL_DOMAIN}`;
}

function connect() {
	const DATABASE_URL = process.env.DATABASE_URL;
	if (!DATABASE_URL) {
		throw new Error(
			'DATABASE_URL is not set (copy .env.example to .env and fill it in; Playwright loads .env automatically)'
		);
	}
	const client = postgres(DATABASE_URL);
	return { client, db: drizzle(client, { schema }) };
}

/**
 * Delete accounts a test created, so a run leaves the database as it found it.
 *
 * Deleting the user row is enough to take its sessions, credentials, profile,
 * matches, tournament registrations and scan events with it — every foreign key
 * to `user.id` is ON DELETE CASCADE. `verification` is the one exception: it
 * keys off the email string with no foreign key, so nothing cascades to it.
 * It's empty today (this app never verifies an address) and cleared here anyway,
 * so enabling verification later can't start silently orphaning rows.
 *
 * A tournament created by a deleted user would survive with a null creator —
 * no test creates one, but that's the gap to close if one ever does.
 */
export async function deleteE2eUsers(emails: string[]) {
	if (emails.length === 0) return;

	// A cleanup routine that deletes the wrong row would quietly gut the seeded
	// data every other suite logs in as, so refuse anything we didn't generate
	// rather than trusting the caller's list.
	const foreign = emails.filter((email) => !email.startsWith(E2E_EMAIL_PREFIX));
	if (foreign.length > 0) {
		throw new Error(`refusing to delete non-e2e accounts: ${foreign.join(', ')}`);
	}

	const { client, db } = connect();
	try {
		await db.delete(schema.verification).where(inArray(schema.verification.identifier, emails));
		await db.delete(schema.user).where(inArray(schema.user.email, emails));
	} finally {
		await client.end();
	}
}

/**
 * Remove accounts stranded by an earlier run that died between creating one and
 * cleaning it up — a hard interrupt, a CI timeout. Returns how many it deleted.
 */
export async function sweepE2eUsers() {
	const { client, db } = connect();
	try {
		const pattern = `${E2E_EMAIL_PREFIX}%${E2E_EMAIL_DOMAIN}`;
		await db.delete(schema.verification).where(like(schema.verification.identifier, pattern));
		const stranded = await db.delete(schema.user).where(like(schema.user.email, pattern)).returning({
			email: schema.user.email
		});
		return stranded.length;
	} finally {
		await client.end();
	}
}

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

/**
 * Registers a throwaway account and lands signed in as it, returning the
 * address so the caller can delete it (see `deleteE2eUsers`).
 *
 * The AI Config seam keys LaunchDarkly targeting on the user id
 * (`buildServerContext`), and a percentage rollout buckets that key
 * deterministically -- so a suite that always signs in as the seeded Max
 * evaluates every run against whichever variation Max happens to land in, and
 * never exercises the other one. A fresh user per test is what makes a repeated
 * run spread across variations the way real traffic does. It also starts each
 * test on an empty scan-throttle history rather than accumulating against one
 * shared account.
 *
 * Demo mode can't register (its accounts are fixtures, not rows), and its
 * context keys are already fixed per demo account, so there is nothing to
 * randomize -- it signs in as Max instead.
 */
export async function loginAsFreshUser(page: Page): Promise<string | null> {
	if (process.env.DEMO_MODE === 'true') {
		await loginAsMax(page);
		return null;
	}

	const email = newE2eEmail();
	const password = 'password123';
	await page.goto('/register');
	await page.getByLabel('Name', { exact: true }).fill(faker.person.fullName());
	await page.getByLabel('Email', { exact: true }).fill(email);
	// `exact` matters on both: 'Password' alone also matches 'Confirm password'.
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByLabel('Confirm password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Create account', exact: true }).click();
	await expect(page).toHaveURL(/\/leaderboard/);
	return email;
}

// Resolves once LaunchDarkly has identified the logged-in user, using the
// `data-ld-context` attribute the layout already puts on the header (see
// src/routes/+layout.svelte). Before identify() resolves the attribute is
// empty or 'anonymous', and any flag-gated UI has only been evaluated against
// the anonymous context — so waiting on it removes the race between landing on
// a page and that page's flag gate settling.
//
// Applies in both modes: initLD() falls back to a committed client-side ID
// (see DEFAULT_LD_CLIENT_ID in $lib/stores/launchdarkly), so demo mode talks to
// the real LaunchDarkly environment too and identifies its cookie-backed user
// like any other session.
//
// Returns false rather than throwing if it never happens — LaunchDarkly is a
// network dependency, and a test that only needs a flag-gated element to be
// absent shouldn't fail because LD was unreachable.
export async function waitForLdIdentified(page: Page, timeout = 10_000) {
	try {
		await page.waitForFunction(
			() => {
				const key = document.querySelector('header')?.getAttribute('data-ld-context');
				return !!key && key !== 'anonymous';
			},
			undefined,
			{ timeout }
		);
		return true;
	} catch {
		return false;
	}
}

// Signs out via the header button and lands back on /login. Works in both
// modes now that demo mode has a real (cookie-backed) session to clear.
export async function signOut(page: Page) {
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page).toHaveURL(/\/login/);
}
