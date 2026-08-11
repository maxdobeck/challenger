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
