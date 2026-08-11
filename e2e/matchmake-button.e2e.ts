import { expect, test, type Locator } from '@playwright/test';
import { loginAsMax, waitForLdIdentified } from './helpers';

// The "Matchmake Now!" button (leaderboard/+page.svelte, stats/+page.svelte)
// is gated on the live `social-matchmake` LD flag, so whether it renders
// depends on that flag's targeting for whichever LD environment is
// configured — it's served to only a slice of contexts, in demo mode as well
// as real-auth mode. Rather than requiring a specific flag
// state, this test checks for the button before interacting with it, so it
// passes either way while still exercising the click whenever it's present.
//
// The wait is short because the caller has already blocked on
// waitForLdIdentified(), so by this point the flag has been evaluated against
// the identified context and the button either exists or never will.
async function clickIfPresent(button: Locator, times: number) {
	try {
		await button.waitFor({ state: 'visible', timeout: 1000 });
	} catch {
		return false;
	}
	for (let i = 0; i < times; i++) {
		await button.click();
	}
	return true;
}

test('user logs in, then clicks Matchmake Now on the leaderboard and stats pages if it is shown', async ({
	page
}) => {
	const pageErrors: Error[] = [];
	page.on('pageerror', (err) => pageErrors.push(err));

	await loginAsMax(page);
	await expect(page).toHaveURL(/\/leaderboard/);

	// Block until LD has identified Max (a no-op returning false in demo mode),
	// so a slow identify() isn't mistaken for "the flag is off".
	await waitForLdIdentified(page);

	const matchmakeButton = page.getByRole('button', { name: 'Matchmake Now!', exact: true });

	await clickIfPresent(matchmakeButton, 2);
	// Clicking only records an observability error client-side — it never
	// navigates or throws — so the page should still be right where we left it.
	await expect(page).toHaveURL(/\/leaderboard/);

	await page.goto('/stats');
	await clickIfPresent(matchmakeButton, 1);
	await expect(page).toHaveURL(/\/stats/);

	expect(pageErrors).toEqual([]);
});
