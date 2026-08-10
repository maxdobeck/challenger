import { drizzle } from 'drizzle-orm/postgres-js';
import { and, count, eq, isNotNull, or } from 'drizzle-orm';
import postgres from 'postgres';
import { faker } from '@faker-js/faker';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import * as schema from './schema';
import { team, match, tournament, tournamentAttendee, userProfile } from './schema';
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
	tournaments: Array<{ id: number }>,
	casualOnlyIds: Set<string>,
	tournamentForcedIds: Set<string>
) {
	// Regenerated every run so per-user match counts always match the current
	// targets below, rather than accumulating from whatever a prior run left.
	await db.delete(match);

	// ~40% of matches are tied to a tournament; the rest are casual (null).
	// Any match involving a "casual-only" account (Max, test1) is forced casual
	// so those users have zero tournament matches — hasPlayedTournament stays
	// false for them, giving the LD segment a real split to target. The inverse
	// "tournament-forced" accounts (testTourney) get every match tied to a
	// tournament, so hasPlayedTournament is always true across many events.
	// Casual-only wins ties: a testTourney-vs-Max match stays casual, keeping
	// Max/test1 tournament-free.
	const tournamentIds = tournaments.map((t) => t.id);
	function pickTournamentId(player1Id: string, player2Id: string): number | null {
		if (casualOnlyIds.has(player1Id) || casualOnlyIds.has(player2Id)) return null;
		if (tournamentForcedIds.has(player1Id) || tournamentForcedIds.has(player2Id)) {
			return randomItem(tournamentIds);
		}
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
				tournamentId: pickTournamentId(player1Id, player2Id),
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
	await seedAttendees(staticUserId, userIds, tournaments);
	// Max and test1 are kept tournament-free so hasPlayedTournament is false for
	// them; testTourney is forced tournament-only so hasPlayedTournament is true.
	await seedMatches(
		staticUserId,
		userIds,
		teams,
		tournaments,
		new Set([staticUserId, testUserId]),
		new Set([tourneyUserId])
	);
	await seedUserProfiles();

	console.log('\nSeed complete.');
	console.log(`Static login -> email: ${STATIC_USER.email}, password: ${SEED_PASSWORD}`);

	await client.end();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
