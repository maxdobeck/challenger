import { expect, test } from '@playwright/test';
import { DEMO_LOGIN_ACCOUNTS, CASUAL_PLAYERS, killteamEmail } from '../src/lib/server/db/demo-fixtures';

// DEMO_LOGIN_ACCOUNTS is the single curated list behind the login page's
// "demo account" dropdown in both modes: real DB accounts (seeded via
// `npm run db:seed`) in real-auth mode, in-memory demo identities (see
// $lib/server/demo/data.ts) in demo mode.
//
// Actually logging in as every account is covered separately by
// e2e/traffic/login-demo-accounts.e2e.ts (tagged @traffic, run deliberately
// via `npm run test:e2e:traffic`) -- this test only checks the list's shape,
// so it stays in the default suite without paying for 35 browser round trips.
test('the curated demo-account list is well-formed and reaches every experiment-eligible account', () => {
	// 3 fixed accounts + 12 FAKE_PLAYERS + every CASUAL_PLAYER.
	expect(DEMO_LOGIN_ACCOUNTS.length).toBe(15 + CASUAL_PLAYERS.length);

	const challengerDomainAccounts = DEMO_LOGIN_ACCOUNTS.filter((a) =>
		a.email.toLowerCase().endsWith('@challenger.example.com')
	);
	expect(challengerDomainAccounts.length).toBeGreaterThanOrEqual(2);

	// Every casual player must be selectable from the dropdown: they're the
	// only accounts the `social-matchmake-cta` experiment can enrol, so
	// dropping them would leave no way to demo the "Matchmake Now!" button.
	const casualEmails = new Set(CASUAL_PLAYERS.map(killteamEmail));
	const casualInDropdown = DEMO_LOGIN_ACCOUNTS.filter((a) => casualEmails.has(a.email));
	expect(casualInDropdown.length).toBe(CASUAL_PLAYERS.length);

	// The "Login as <firstName>" button is addressed by first name, so those
	// must stay unique across the list or the locator goes ambiguous.
	const firstNames = DEMO_LOGIN_ACCOUNTS.map((a) => a.name.split(' ')[0]);
	expect(new Set(firstNames).size).toBe(firstNames.length);
});
