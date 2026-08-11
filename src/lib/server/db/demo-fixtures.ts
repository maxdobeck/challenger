import { teamNames } from './teams';

// Shared between the real seed script (src/lib/server/db/seed.ts, writes to
// Postgres with true randomness) and the in-memory demo dataset
// (src/lib/server/demo/data.ts, wants reproducible output) — every generator
// here takes an optional Rng so callers can swap in a seeded PRNG.
export type Rng = () => number;

// Fixed, predictable account for local testing — always seeded with the same
// name/email/password so you can reliably log in as "max".
export const STATIC_USER = { name: 'Max', email: 'max@killteam.example' };

// Extra fixed account for manual testing, alongside the STATIC_USER.
export const TEST_USER = { name: 'test1', email: 'test1@challenger.example.com' };

// Fixed account that is forced to have a tournament match history, so its
// `hasPlayedTournament` LD attribute is always true (the inverse of the
// casual-only accounts above). Used by the banner e2e tests.
export const TOURNEY_USER = { name: 'testTourney', email: 'testTourney@challenger.example.com' };

// Derives a seeded player's email from their display name. Shared with the seed
// script so the login dropdown's addresses can never drift from what's seeded.
export function killteamEmail(name: string): string {
	return `${name.toLowerCase().replace(/\s+/g, '.')}@killteam.example`;
}

export { teamNames };

export const FAKE_PLAYERS = [
	'Kaelen Voss',
	'Ilsa Draven',
	'Torvin Steelgaze',
	'Bren Ashwalker',
	'Ceria Nightbloom',
	'Doran Ferrocast',
	'Elowen Grimvale',
	'Fenric Coldbane',
	'Garrick Emberfall',
	'Hesper Wraithmoor',
	'Ivor Blackquill',
	'Junia Starcarver',
	'Korrin Duskbringer',
	'Lyra Ashenveil',
	'Magnus Thornwick',
	'Nadia Frostgrip',
	'Orin Slatehand',
	'Petra Ironvale',
	'Quill Marrowsworth',
	'Rhoswen Bladecaller',
	'Silas Graven',
	'Talia Ravencrest',
	'Ursin Hollowpeak',
	'Vesper Ninegold',
	'Wren Duskhollow',
	'Xandra Emberlyn',
	'Yorick Stonefell',
	'Zara Nightwind',
	'Aldric Thornbury',
	'Brienne Ashcroft',
	'Corvin Blackwood',
	'Daria Frostvale',
	'Edrin Ravenscar',
	'Freya Ironheart',
	'Gideon Marrowfell',
	'Halcyon Vex',
	'Isolde Graymoor',
	'Jorund Blackpeak',
	'Kestrel Dawnshade',
	'Liora Winterhall',
	'Marek Ashenhollow',
	'Nyra Coldwater',
	'Oswin Blackthorn',
	'Riven Duskgale',
	'Seraphine Vaultwright',
	'Thane Grimhold',
	'Una Stormcaller',
	'Vance Hollowmere'
];

// Players who never attend a tournament, so every match they appear in is
// casual and their `hasPlayedTournament` LD attribute stays false. FAKE_PLAYERS
// above are all tournament-eligible and in practice nearly every one of them
// picks up at least one tournament match, which left the
// `non-tournament-players` segment with only Max and test1 in it — too small a
// population for the `social-matchmake-cta` experiment to accumulate subjects.
// These 20 widen that segment naturally, in both real-auth and demo mode.
//
// Names are fixed constants rather than faker-generated because they're shared
// fixtures: seed.ts and demo/data.ts must derive identical emails from them, so
// the login form accepts the same addresses in both modes.
export const CASUAL_PLAYERS = [
	'Alaric Emberwind',
	'Briar Voidwalker',
	'Cassia Duskbane',
	'Dorian Frostmere',
	'Eira Stormvale',
	'Fenwick Ashgrove',
	'Greta Ironsong',
	'Hollis Nightforge',
	'Imogen Ravenfall',
	'Jasper Coldhearth',
	'Kira Shadowmoor',
	'Lucian Grimwater',
	'Mira Thornfield',
	'Nolan Blackfen',
	'Odessa Winterbourne',
	'Perrin Slatecrag',
	'Rowan Duskwater',
	'Sable Marrowvale',
	'Tobias Emberhold',
	'Vera Nightgale'
];

// Every seeded account shares this password (see seed.ts). Surfaced here so the
// login page's demo-account action can sign these accounts in.
export const DEMO_LOGIN_PASSWORD = 'password123';

// Curated subset of seeded accounts offered in the login page's "demo account"
// dropdown, and (in demo mode) the actual roster of accounts you can log in
// as — 15 total, so there's real breadth to click through, with Max/test1/
// testTourney fixed at the front and the rest the leading FAKE_PLAYERS. All
// are guaranteed to exist after `npm run db:seed` in real-auth mode (every
// one created with DEMO_LOGIN_PASSWORD) and are always present in demo
// mode's in-memory dataset (see $lib/server/demo/data.ts).
export const DEMO_LOGIN_ACCOUNTS: ReadonlyArray<{ name: string; email: string }> = [
	{ name: STATIC_USER.name, email: STATIC_USER.email },
	{ name: TEST_USER.name, email: TEST_USER.email },
	{ name: TOURNEY_USER.name, email: TOURNEY_USER.email },
	...FAKE_PLAYERS.slice(0, 12).map((name) => ({ name, email: killteamEmail(name) }))
];

// Match-count targets: Max always gets exactly this many, everyone else gets
// a random count in the range below (as their own logged, player1 matches).
export const STATIC_USER_MATCH_COUNT = 23;
export const RANDOM_MATCH_COUNT_RANGE: [number, number] = [12, 53];

// Building blocks for the in-memory demo tournaments (src/lib/server/demo/data.ts).
// The real seed (seed.ts) uses faker for true randomness; the demo wants a fixed,
// reproducible set, so it composes names/venues/addresses from these arrays via the
// seeded Rng instead.
export const DEMO_TOURNAMENT_COUNT = 60;

export const TOURNAMENT_SUFFIXES = [
	'Championship',
	'Open',
	'RTT',
	'Grand Clash',
	'Skirmish',
	'Qualifier',
	'Invitational',
	'Cup',
	'Showdown',
	'Masters'
];

export const VENUE_TYPES = [
	'Convention Center',
	'Game Hall',
	'Legion Post',
	'Arena',
	'Community Center',
	'Wargaming Club',
	'Expo Center'
];

export const DEMO_CITIES = [
	'Ashford',
	'Bright Harbor',
	'Cinderfall',
	'Dunmoor',
	'Everlight',
	'Frostgate',
	'Grimhollow',
	'Highreach',
	'Ironford',
	'Kessering',
	'Lowmarsh',
	'Northwind',
	'Oakvale',
	'Pinecrest',
	'Ravenmoor',
	'Stonebrook'
];

export const DEMO_VENUE_HOSTS = [
	'Blackspire',
	'Crimson Banner',
	'Dragonfire',
	'Emberwood',
	'Grey Warden',
	'Kingsmoot',
	'Silverpin',
	'Thunderhall'
];

export const DEMO_STREETS = [
	'Market St',
	'Guild Row',
	'Foundry Ave',
	'Harbor Way',
	'Kingsroad',
	'Mill Lane',
	'Coppergate',
	'Wyvern Blvd'
];

export const DEMO_TOURNAMENT_DETAILS = [
	'Two-day event, five rounds, current championship rules pack.',
	'Casual one-day RTT — all welcome, bring three lists.',
	'Regional qualifier feeding into the seasonal invitational.',
	'Narrative campaign day with escalating point limits.',
	'Singles bracket, best-of-three finals, prize support for top four.'
];

export function randomItem<T>(items: T[], rng: Rng = Math.random): T {
	return items[Math.floor(rng() * items.length)];
}

export function randomInt(min: number, max: number, rng: Rng = Math.random): number {
	return Math.floor(rng() * (max - min + 1)) + min;
}

export function randomPastDate(daysBack: number, rng: Rng = Math.random): Date {
	const now = Date.now();
	const past = now - randomInt(0, daysBack, rng) * 24 * 60 * 60 * 1000;
	return new Date(past);
}

// Kill Team VP categories (crit/tac/kill) range 0-6. Primary is derived from a
// randomly chosen one of those three, for seeding purposes only: primary =
// ceil(base / 2), so it ranges 0-3.
export function randomScoreSet(rng: Rng = Math.random) {
	const crit = randomInt(0, 6, rng);
	const tac = randomInt(0, 6, rng);
	const kill = randomInt(0, 6, rng);
	const base = randomItem([crit, tac, kill], rng);
	const primary = Math.ceil(base / 2);
	return { crit, tac, kill, primary };
}
