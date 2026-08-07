import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Shared between the real seed script (src/lib/server/db/seed.ts, writes to
// Postgres with true randomness) and the in-memory demo dataset
// (src/lib/server/demo/data.ts, wants reproducible output) — every generator
// here takes an optional Rng so callers can swap in a seeded PRNG.
export type Rng = () => number;

// Fixed, predictable account for local testing — always seeded with the same
// name/email/password so you can reliably log in as "max".
export const STATIC_USER = { name: 'Max', email: 'max@killteam.example' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const teamNames = readFileSync(path.resolve(__dirname, '../../../../teams.txt'), 'utf-8')
	.split('\n')
	.map((line) => line.trim())
	.filter(Boolean);

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
