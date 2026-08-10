import { drizzle } from 'drizzle-orm/postgres-js';
import { and, count, eq, isNotNull, or, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { faker } from '@faker-js/faker';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import * as schema from './schema';
import { team, match, tournament, tournamentAttendee, user, userProfile } from './schema';
import {
	STATIC_USER,
	TEST_USER,
	TOURNEY_USER,
	teamNames,
	FAKE_PLAYERS,
	STATIC_USER_MATCH_COUNT,
	RANDOM_MATCH_COUNT_RANGE,
	killteamEmail,
	randomItem,
	randomInt,
	randomPastDate,
	randomScoreSet
} from './demo-fixtures';

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
		// Detect "user already exists" by the error's shape, not `instanceof
		// APIError`: better-auth throws its own APIError class instance, which
		// isn't the same constructor we import here (ESM/CJS duplication), so
		// instanceof is unreliable across the module boundary.
		const code =
			error instanceof APIError
				? error.body?.code
				: (error as { body?: { code?: string } } | null)?.body?.code;
		if (code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
			// Already exists from a previous seed run — look up the id instead.
			// Plain select rather than the relational query builder: db.query.user
			// can come back empty here depending on schema-registration timing.
			// Case-insensitive match because better-auth lowercases emails on
			// signup (e.g. testTourney@… is stored as testtourney@…).
			const [existing] = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(sql`lower(${user.email})`, email.toLowerCase()))
				.limit(1);
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

	const testUser = await seedUser(TEST_USER.name, TEST_USER.email);
	userIds.push(testUser.id);
	if (testUser.created) created++;
	else skipped++;

	const tourneyUser = await seedUser(TOURNEY_USER.name, TOURNEY_USER.email);
	userIds.push(tourneyUser.id);
	if (tourneyUser.created) created++;
	else skipped++;

	for (const name of FAKE_PLAYERS) {
		const email = killteamEmail(name);
		const user = await seedUser(name, email);
		userIds.push(user.id);
		if (user.created) created++;
		else skipped++;
	}

	console.log(`Users: ${created} created, ${skipped} already existed.`);
	return {
		staticUserId: staticUser.id,
		testUserId: testUser.id,
		tourneyUserId: tourneyUser.id,
		userIds
	};
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
	userIds: string[],
	tournaments: Array<{ id: number }>,
	casualOnlyIds: Set<string>,
	tournamentForcedIds: Set<string>
): Promise<Map<number, string[]>> {
	// Casual-only accounts (Max, test1) are never registered for a tournament, so
	// they can never pick up a tournament match below.
	const eligible = userIds.filter((id) => !casualOnlyIds.has(id));
	const forced = [...tournamentForcedIds];

	const rows: Array<typeof tournamentAttendee.$inferInsert> = [];
	const attendeesByTournament = new Map<number, string[]>();

	tournaments.forEach((t, idx) => {
		// Register a random subset of eligible players per tournament.
		const attendees = new Set(faker.helpers.arrayElements(eligible, { min: 2, max: 12 }));
		// Guarantee the tournament-forced account(s) attend plenty of events (and at
		// least the first few) so their hasPlayedTournament attribute is always true.
		if (idx < 3 || faker.datatype.boolean(0.3)) {
			for (const id of forced) attendees.add(id);
		}
		const ids = [...attendees];
		attendeesByTournament.set(t.id, ids);
		for (const userId of ids) {
			rows.push({ tournamentId: t.id, userId });
		}
	});

	await db.insert(tournamentAttendee).values(rows);
	console.log(`Attendees: ${rows.length} registrations across ${tournaments.length} tournaments.`);
	return attendeesByTournament;
}

async function seedMatches(
	staticUserId: string,
	userIds: string[],
	teams: Array<{ id: number; name: string }>,
	attendeesByTournament: Map<number, string[]>,
	tournamentForcedIds: Set<string>
) {
	// Regenerated every run so per-user match counts always match the current
	// targets below, rather than accumulating from whatever a prior run left.
	await db.delete(match);

	const rows: Array<typeof match.$inferInsert> = [];

	// Build one match row with random teams/scores/date; the caller decides the
	// players and whether it's tied to a tournament.
	function buildMatch(player1Id: string, player2Id: string, tournamentId: number | null) {
		const player1Team = randomItem(teams);
		const player2Team = randomItem(teams);
		const p1 = randomScoreSet();
		const p2 = randomScoreSet();
		rows.push({
			player1Id,
			player2Id,
			player1TeamId: player1Team.id,
			player2TeamId: player2Team.id,
			tournamentId,
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

	// Tournament matches: each event plays ceil(attendees / 2) matches, pairing its
	// attendees so everyone plays at least once (an odd attendee out gets a rematch).
	// Casual-only accounts (Max, test1) are never attendees, so they never appear here
	// and their hasPlayedTournament attribute stays false.
	let tournamentMatches = 0;
	for (const [tournamentId, attendeeIds] of attendeesByTournament) {
		if (attendeeIds.length < 2) continue;
		const shuffled = faker.helpers.shuffle([...attendeeIds]);
		const matchCount = Math.ceil(shuffled.length / 2);
		for (let k = 0; k < matchCount; k++) {
			const player1Id = shuffled[2 * k];
			let player2Id = shuffled[2 * k + 1];
			if (player2Id === undefined) {
				player2Id = randomItem(shuffled);
				while (player2Id === player1Id) player2Id = randomItem(shuffled);
			}
			buildMatch(player1Id, player2Id, tournamentId);
			tournamentMatches++;
		}
	}

	// Casual match history (never tied to a tournament). Tournament-forced accounts
	// (testTourney) are skipped entirely, so every match they appear in is a
	// tournament match and hasPlayedTournament is always true for them.
	const casualOpponents = userIds.filter((id) => !tournamentForcedIds.has(id));
	let casualMatches = 0;
	for (const player1Id of userIds) {
		if (tournamentForcedIds.has(player1Id)) continue;
		const targetGames =
			player1Id === staticUserId ? STATIC_USER_MATCH_COUNT : randomInt(...RANDOM_MATCH_COUNT_RANGE);
		for (let i = 0; i < targetGames; i++) {
			let player2Id = randomItem(casualOpponents);
			while (player2Id === player1Id) player2Id = randomItem(casualOpponents);
			buildMatch(player1Id, player2Id, null);
			casualMatches++;
		}
	}

	await db.insert(match).values(rows);
	console.log(
		`Matches: ${rows.length} inserted (${tournamentMatches} tournament, ${casualMatches} casual).`
	);
}

// Precompute LaunchDarkly attributes for every user from the match table.
// hasPlayedTournament is true only when the user has at least one match tied to
// a tournament; totalMatches counts every match they appear in. Idempotent.
async function seedUserProfiles() {
	const allUsers = await db.select().from(schema.user);
	for (const u of allUsers) {
		const isPlayer = or(eq(match.player1Id, u.id), eq(match.player2Id, u.id));
		const [{ total }] = await db.select({ total: count() }).from(match).where(isPlayer);
		const [{ tournamentTotal }] = await db
			.select({ tournamentTotal: count() })
			.from(match)
			.where(and(isNotNull(match.tournamentId), isPlayer));
		await db
			.insert(userProfile)
			.values({
				userId: u.id,
				hasPlayedTournament: tournamentTotal > 0,
				totalMatches: total
			})
			.onConflictDoUpdate({
				target: userProfile.userId,
				set: {
					hasPlayedTournament: tournamentTotal > 0,
					totalMatches: total,
					updatedAt: new Date()
				}
			});
	}
	console.log(`User profiles: ${allUsers.length} upserted.`);
}

async function main() {
	const teams = await seedTeams();
	const { staticUserId, testUserId, tourneyUserId, userIds } = await seedUsers();
	const tournaments = await seedTournaments(staticUserId);
	// Max and test1 are kept tournament-free (never attendees) so hasPlayedTournament
	// is false for them; testTourney is forced tournament-only so it's always true.
	const casualOnlyIds = new Set([staticUserId, testUserId]);
	const tournamentForcedIds = new Set([tourneyUserId]);
	const attendeesByTournament = await seedAttendees(
		userIds,
		tournaments,
		casualOnlyIds,
		tournamentForcedIds
	);
	await seedMatches(staticUserId, userIds, teams, attendeesByTournament, tournamentForcedIds);
	await seedUserProfiles();

	console.log('\nSeed complete.');
	console.log(`Static login -> email: ${STATIC_USER.email}, password: ${SEED_PASSWORD}`);

	await client.end();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
