import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { faker } from '@faker-js/faker';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import * as schema from './schema';
import { team, match, tournament, tournamentAttendee } from './schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is not set (run via `npm run db:seed`)');

const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

// Standalone auth instance for seeding: same adapter/config as src/lib/server/auth.ts,
// minus the SvelteKit-only cookie plugin (there's no request context here).
const auth = betterAuth({
	secret: process.env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true }
});

const SEED_PASSWORD = 'password123';

// Fixed, predictable account for local testing — always seeded with the same
// name/email/password so you can reliably log in as "max".
const STATIC_USER = { name: 'Max', email: 'max@killteam.example' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const teamNames = readFileSync(path.resolve(__dirname, '../../../../teams.txt'), 'utf-8')
	.split('\n')
	.map((line) => line.trim())
	.filter(Boolean);

const FAKE_PLAYERS = [
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
const STATIC_USER_MATCH_COUNT = 23;
const RANDOM_MATCH_COUNT_RANGE: [number, number] = [12, 53];

// Number of fake tournaments to generate with faker.js.
const TOURNAMENT_COUNT = 453;

const TOURNAMENT_SUFFIXES = [
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

const VENUE_TYPES = [
	'Convention Center',
	'Game Hall',
	'Legion Post',
	'Arena',
	'Community Center',
	'Wargaming Club',
	'Expo Center'
];

// Builds one fake tournament. Dates are 'YYYY-MM-DD' strings for the Postgres
// `date` columns (drizzle's date column is string-mode by default). End date is
// the same day or up to two days after the start.
function fakeTournament() {
	const start = faker.date.between({ from: '2025-01-01', to: '2026-12-31' });
	const end = new Date(start);
	end.setDate(end.getDate() + faker.number.int({ min: 0, max: 2 }));
	const toISODate = (d: Date) => d.toISOString().slice(0, 10);

	const city = faker.location.city();
	return {
		name: `${city} ${faker.helpers.arrayElement(TOURNAMENT_SUFFIXES)}`,
		startDate: toISODate(start),
		endDate: toISODate(end),
		location: `${faker.company.name()} ${faker.helpers.arrayElement(VENUE_TYPES)}`,
		address: `${faker.location.streetAddress()}, ${city}, ${faker.location.state({ abbreviated: true })} ${faker.location.zipCode()}`,
		details: faker.lorem.sentences({ min: 1, max: 3 })
	};
}

function randomItem<T>(items: T[]): T {
	return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPastDate(daysBack: number): Date {
	const now = Date.now();
	const past = now - randomInt(0, daysBack) * 24 * 60 * 60 * 1000;
	return new Date(past);
}

// Kill Team VP categories (crit/tac/kill) range 0-6. Primary is derived from a
// randomly chosen one of those three, for seeding purposes only: primary =
// ceil(base / 2), so it ranges 0-3.
function randomScoreSet() {
	const crit = randomInt(0, 6);
	const tac = randomInt(0, 6);
	const kill = randomInt(0, 6);
	const base = randomItem([crit, tac, kill]);
	const primary = Math.ceil(base / 2);
	return { crit, tac, kill, primary };
}

async function seedTeams() {
	const existing = await db.select({ name: team.name }).from(team);
	const existingNames = new Set(existing.map((t) => t.name));
	const toInsert = teamNames.filter((name) => !existingNames.has(name));

	if (toInsert.length > 0) {
		await db.insert(team).values(toInsert.map((name) => ({ name })));
	}

	console.log(`Teams: ${existingNames.size} already present, ${toInsert.length} inserted.`);
	return db.select().from(team);
}

async function seedUser(name: string, email: string) {
	try {
		const result = await auth.api.signUpEmail({
			body: { name, email, password: SEED_PASSWORD }
		});
		return { id: result.user.id, created: true };
	} catch (error) {
		if (error instanceof APIError) {
			// Already exists from a previous seed run — look up the id instead.
			const existing = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.email, email) });
			if (!existing) throw error;
			return { id: existing.id, created: false };
		}
		throw error;
	}
}

async function seedUsers() {
	const userIds: string[] = [];
	let created = 0;
	let skipped = 0;

	const staticUser = await seedUser(STATIC_USER.name, STATIC_USER.email);
	userIds.push(staticUser.id);
	if (staticUser.created) created++;
	else skipped++;

	for (const name of FAKE_PLAYERS) {
		const email = `${name.toLowerCase().replace(/\s+/g, '.')}@killteam.example`;
		const user = await seedUser(name, email);
		userIds.push(user.id);
		if (user.created) created++;
		else skipped++;
	}

	console.log(`Users: ${created} created, ${skipped} already existed.`);
	return { staticUserId: staticUser.id, userIds };
}

async function seedTournaments(staticUserId: string) {
	// Cleared and regenerated every run. Attendees cascade-delete with the
	// tournament; existing matches keep their row but have tournament_id set to
	// null (FK onDelete: 'set null') — they're re-seeded below regardless.
	await db.delete(tournamentAttendee);
	await db.delete(tournament);

	const values = Array.from({ length: TOURNAMENT_COUNT }, () => ({
		...fakeTournament(),
		createdById: staticUserId
	}));
	await db.insert(tournament).values(values);

	const tournaments = await db.select().from(tournament);
	console.log(`Tournaments: ${tournaments.length} inserted.`);
	return tournaments;
}

async function seedAttendees(
	staticUserId: string,
	userIds: string[],
	tournaments: Array<{ id: number }>
) {
	const rows: Array<typeof tournamentAttendee.$inferInsert> = [];

	for (const t of tournaments) {
		// Register a random subset of players per tournament. Max is added to a
		// random ~25% of events so the static account has tournaments to show.
		const attendees = new Set(faker.helpers.arrayElements(userIds, { min: 2, max: 12 }));
		if (faker.datatype.boolean(0.25)) {
			attendees.add(staticUserId);
		}
		for (const userId of attendees) {
			rows.push({ tournamentId: t.id, userId });
		}
	}

	await db.insert(tournamentAttendee).values(rows);
	console.log(`Attendees: ${rows.length} registrations across ${tournaments.length} tournaments.`);
}

async function seedMatches(
	staticUserId: string,
	userIds: string[],
	teams: Array<{ id: number; name: string }>,
	tournaments: Array<{ id: number }>
) {
	// Regenerated every run so per-user match counts always match the current
	// targets below, rather than accumulating from whatever a prior run left.
	await db.delete(match);

	// ~40% of matches are tied to a tournament; the rest are casual (null).
	const tournamentIds = tournaments.map((t) => t.id);
	function randomTournamentId(): number | null {
		return Math.random() < 0.4 ? randomItem(tournamentIds) : null;
	}

	const rows: Array<typeof match.$inferInsert> = [];

	for (const player1Id of userIds) {
		const targetGames =
			player1Id === staticUserId ? STATIC_USER_MATCH_COUNT : randomInt(...RANDOM_MATCH_COUNT_RANGE);

		for (let i = 0; i < targetGames; i++) {
			let player2Id = randomItem(userIds);
			while (player2Id === player1Id) {
				player2Id = randomItem(userIds);
			}

			const player1Team = randomItem(teams);
			const player2Team = randomItem(teams);
			const p1 = randomScoreSet();
			const p2 = randomScoreSet();

			rows.push({
				player1Id,
				player2Id,
				player1TeamId: player1Team.id,
				player2TeamId: player2Team.id,
				tournamentId: randomTournamentId(),
				player1Crit: p1.crit,
				player1Tac: p1.tac,
				player1Kill: p1.kill,
				player1Primary: p1.primary,
				player2Crit: p2.crit,
				player2Tac: p2.tac,
				player2Kill: p2.kill,
				player2Primary: p2.primary,
				playedAt: randomPastDate(180)
			});
		}
	}

	await db.insert(match).values(rows);
	console.log(`Matches: ${rows.length} inserted (Max: ${STATIC_USER_MATCH_COUNT}, others: ${RANDOM_MATCH_COUNT_RANGE[0]}-${RANDOM_MATCH_COUNT_RANGE[1]} each, as their own logged games).`);
}

async function main() {
	const teams = await seedTeams();
	const { staticUserId, userIds } = await seedUsers();
	const tournaments = await seedTournaments(staticUserId);
	await seedAttendees(staticUserId, userIds, tournaments);
	await seedMatches(staticUserId, userIds, teams, tournaments);

	console.log('\nSeed complete.');
	console.log(`Static login -> email: ${STATIC_USER.email}, password: ${SEED_PASSWORD}`);

	await client.end();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
