import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import * as schema from './schema';
import { team, match } from './schema';
import {
	STATIC_USER,
	teamNames,
	FAKE_PLAYERS,
	STATIC_USER_MATCH_COUNT,
	RANDOM_MATCH_COUNT_RANGE,
	TOURNAMENT_NAMES,
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

async function seedMatches(
	staticUserId: string,
	userIds: string[],
	teams: Array<{ id: number; name: string }>
) {
	// Regenerated every run so per-user match counts always match the current
	// targets below, rather than accumulating from whatever a prior run left.
	await db.delete(match);

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
				tournament: randomItem(TOURNAMENT_NAMES),
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
	await seedMatches(staticUserId, userIds, teams);

	console.log('\nSeed complete.');
	console.log(`Static login -> email: ${STATIC_USER.email}, password: ${SEED_PASSWORD}`);

	await client.end();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
