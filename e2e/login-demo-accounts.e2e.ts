import { expect, test } from '@playwright/test';
import {
	DEMO_LOGIN_ACCOUNTS,
	DEMO_LOGIN_FAKE_PLAYER_COUNT,
	DEMO_LOGIN_CASUAL_PLAYER_COUNT,
	CASUAL_PLAYERS,
	HEAVY_TOURNEY_USER,
	killteamEmail
} from '../src/lib/server/db/demo-fixtures';

// DEMO_LOGIN_ACCOUNTS is the single curated list behind the login page's
// "demo account" dropdown in both modes: real DB accounts (seeded via
// `npm run db:seed`) in real-auth mode, in-memory demo identities (see
// $lib/server/demo/data.ts) in demo mode.
//
// Actually logging in as every account is covered separately by
// e2e/traffic/login-demo-accounts.e2e.ts (tagged @traffic, run deliberately
// via `npm run test:e2e:traffic`) -- this test only checks the list's shape,
// so it stays in the default suite without paying for a browser round trip
// per account.
test('the curated demo-account list is short, well-formed, and reaches an experiment-eligible account', () => {
	// 4 fixed accounts + the leading FAKE_PLAYERS + the leading CASUAL_PLAYERS.
	// The dropdown is meant to stay scannable, so this is a ceiling, not just a
	// running total: every other seeded account is still reachable through the
	// plain email/password form.
	expect(DEMO_LOGIN_ACCOUNTS.length).toBe(
		4 + DEMO_LOGIN_FAKE_PLAYER_COUNT + DEMO_LOGIN_CASUAL_PLAYER_COUNT
	);
	expect(DEMO_LOGIN_ACCOUNTS.length).toBeLessThanOrEqual(10);

	const challengerDomainAccounts = DEMO_LOGIN_ACCOUNTS.filter((a) =>
		a.email.toLowerCase().endsWith('@challenger.example.com')
	);
	expect(challengerDomainAccounts.length).toBeGreaterThanOrEqual(2);

	// heavytourneyuser is the tournament-history persona the dropdown exists to
	// reach, so it must stay near the top of the list rather than drift down it.
	const heavyIndex = DEMO_LOGIN_ACCOUNTS.findIndex((a) => a.email === HEAVY_TOURNEY_USER.email);
	expect(heavyIndex).toBeGreaterThanOrEqual(0);
	expect(heavyIndex).toBeLessThan(3);

	// At least one casual player must stay selectable from the dropdown: they
	// and Max/test1 are the only accounts the `social-matchmake-cta` experiment
	// can enrol, so dropping them all would leave no one-click way to reach an
	// account that can show the "Matchmake Now!" button.
	const casualEmails = new Set(CASUAL_PLAYERS.map(killteamEmail));
	const casualInDropdown = DEMO_LOGIN_ACCOUNTS.filter((a) => casualEmails.has(a.email));
	expect(casualInDropdown.length).toBe(DEMO_LOGIN_CASUAL_PLAYER_COUNT);
	expect(casualInDropdown.length).toBeGreaterThan(0);

	// The "Login as <firstName>" button is addressed by first name, so those
	// must stay unique across the list or the locator goes ambiguous.
	const firstNames = DEMO_LOGIN_ACCOUNTS.map((a) => a.name.split(' ')[0]);
	expect(new Set(firstNames).size).toBe(firstNames.length);
});
