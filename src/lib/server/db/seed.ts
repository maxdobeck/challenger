import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import * as schema from './schema';
import { team, match } from './schema';

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
	'Vesper Ninegold'
];

const TOURNAMENT_NAMES = [
	'Winter Championship',
	'Local RTT',
	'Round 3 Open',
	'Spring Skirmish',
	'Regional Qualifier',
	'Friday Night Kill Team',
	'Grand Clash',
	null,
	null
];

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
	const createdUserIds: string[] = [];
	let created = 0;
	let skipped = 0;

	const staticUser = await seedUser(STATIC_USER.name, STATIC_USER.email);
	createdUserIds.push(staticUser.id);
	staticUser.created ? created++ : skipped++;

	for (const name of FAKE_PLAYERS) {
		const email = `${name.toLowerCase().replace(/\s+/g, '.')}@killteam.example`;
		const user = await seedUser(name, email);
		createdUserIds.push(user.id);
		user.created ? created++ : skipped++;
	}

	console.log(`Users: ${created} created, ${skipped} already existed.`);
	return createdUserIds;
}

async function seedMatches(userIds: string[], teams: Array<{ id: number; name: string }>) {
	const existingCount = await db.$count(match);
	if (existingCount > 0) {
		console.log(`Matches: ${existingCount} already present, skipping match seeding.`);
		return;
	}

	const rows: Array<typeof match.$inferInsert> = [];
	const totalMatches = userIds.length * randomInt(4, 8);

	for (let i = 0; i < totalMatches; i++) {
		const player1Id = randomItem(userIds);
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

	await db.insert(match).values(rows);
	console.log(`Matches: ${rows.length} inserted.`);
}

async function main() {
	const teams = await seedTeams();
	const userIds = await seedUsers();
	await seedMatches(userIds, teams);

	console.log('\nSeed complete.');
	console.log(`Static login -> email: ${STATIC_USER.email}, password: ${SEED_PASSWORD}`);

	await client.end();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
