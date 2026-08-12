import {
	STATIC_USER,
	TEST_USER,
	TOURNEY_USER,
	teamNames,
	FAKE_PLAYERS,
	CASUAL_PLAYERS,
	killteamEmail,
	STATIC_USER_MATCH_COUNT,
	RANDOM_MATCH_COUNT_RANGE,
	DEMO_TOURNAMENT_COUNT,
	TOURNAMENT_SUFFIXES,
	VENUE_TYPES,
	DEMO_CITIES,
	DEMO_VENUE_HOSTS,
	DEMO_STREETS,
	DEMO_TOURNAMENT_DETAILS,
	randomItem,
	randomInt,
	randomPastDate,
	randomScoreSet,
	type Rng
} from '$lib/server/db/demo-fixtures';
import type { PrimaryOpChoice } from '$lib/server/scoring';
import { isKvConfigured, nextKvMatchId, pushKvMatch, getKvMatches } from '$lib/server/demo/kv';

type DemoUser = { id: string; name: string; email: string };
type DemoTeam = { id: number; name: string };
type DemoTournament = {
	id: number;
	name: string;
	startDate: string; // 'YYYY-MM-DD'
	endDate: string; // 'YYYY-MM-DD'
	location: string;
	address: string | null;
	details: string | null;
	createdById: string;
};
type DemoAttendee = { tournamentId: number; userId: string; registeredAt: Date };
type DemoMatch = {
	id: number;
	player1Id: string;
	player2Id: string;
	player1TeamId: number;
	player2TeamId: number;
	tournamentId: number | null;
	player1Crit: number;
	player1Tac: number;
	player1Kill: number;
	player1Primary: number;
	player1PrimaryOpChoice: PrimaryOpChoice | null;
	player2Crit: number;
	player2Tac: number;
	player2Kill: number;
	player2Primary: number;
	player2PrimaryOpChoice: PrimaryOpChoice | null;
	playedAt: Date;
};

// Fixed seed so the demo dataset (teams/players/match history) is identical
// on every server start, rather than reshuffling like the real seed script.
function mulberry32(seed: number): Rng {
	let a = seed;
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rng = mulberry32(20260806);

const MAX_ID = 'demo-max';
const TEST1_ID = 'demo-test1';
const TOURNEY_ID = 'demo-tourney';

export const DEMO_MODE: boolean = true;
export const demoTeams: DemoTeam[] = teamNames.map((name, index) => ({ id: index + 1, name }));

// Mirrors DEMO_LOGIN_ACCOUNTS' fixed accounts (Max, test1, testTourney) so the
// same curated login accounts resolve to real identities — with generated
// match/tournament history — in demo mode, not just in the seeded DB.
export const demoUsers: DemoUser[] = [
	{ id: MAX_ID, name: STATIC_USER.name, email: STATIC_USER.email },
	{ id: TEST1_ID, name: TEST_USER.name, email: TEST_USER.email },
	{ id: TOURNEY_ID, name: TOURNEY_USER.name, email: TOURNEY_USER.email },
	...FAKE_PLAYERS.map((name, index) => ({
		id: `demo-player-${index + 1}`,
		name,
		email: killteamEmail(name)
	})),
	...CASUAL_PLAYERS.map((name, index) => ({
		id: `demo-casual-${index + 1}`,
		name,
		email: killteamEmail(name)
	}))
];

// The casual-only cohort: never registered for a tournament below, so every
// match they appear in is casual and hasPlayedTournament stays false. Mirrors
// seed.ts's casualOnlyIds — see CASUAL_PLAYERS in demo-fixtures.ts.
const casualOnlyIds = new Set(CASUAL_PLAYERS.map((_, index) => `demo-casual-${index + 1}`));

// Full `User`-shaped record (the auth session shape) for a demo account, built
// on demand rather than stored per-user since it's only needed once a login
// resolves who signed in.
function toDemoAuthUser(u: DemoUser) {
	return {
		id: u.id,
		name: u.name,
		email: u.email,
		emailVerified: true,
		image: null,
		createdAt: new Date('2026-01-01T00:00:00Z'),
		updatedAt: new Date('2026-01-01T00:00:00Z')
	};
}

// Looked up by the demo session cookie (id) and by /login's sign-in actions
// (email, case-insensitive to match better-auth's own normalization).
export const demoAuthUsersById = new Map(demoUsers.map((u) => [u.id, toDemoAuthUser(u)]));
export const demoAuthUsersByEmail = new Map(
	demoUsers.map((u) => [u.email.toLowerCase(), toDemoAuthUser(u)])
);

// Reproducible in-memory tournaments, composed from the shared fixture arrays via
// the seeded rng (the real seed uses faker instead — see seed.ts).
function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

const TOURNAMENT_RANGE_START = Date.parse('2025-01-01T00:00:00Z');
const TOURNAMENT_RANGE_END = Date.parse('2026-12-31T00:00:00Z');

export const demoTournaments: DemoTournament[] = [];
for (let i = 1; i <= DEMO_TOURNAMENT_COUNT; i++) {
	const city = randomItem(DEMO_CITIES, rng);
	const startMs =
		TOURNAMENT_RANGE_START + Math.floor(rng() * (TOURNAMENT_RANGE_END - TOURNAMENT_RANGE_START));
	const start = new Date(startMs);
	const end = new Date(startMs + randomInt(0, 2, rng) * 24 * 60 * 60 * 1000);
	demoTournaments.push({
		id: i,
		name: `${city} ${randomItem(TOURNAMENT_SUFFIXES, rng)}`,
		startDate: isoDate(start),
		endDate: isoDate(end),
		location: `${randomItem(DEMO_VENUE_HOSTS, rng)} ${randomItem(VENUE_TYPES, rng)}`,
		address: `${randomInt(10, 9999, rng)} ${randomItem(DEMO_STREETS, rng)}, ${city}`,
		details: randomItem(DEMO_TOURNAMENT_DETAILS, rng),
		createdById: MAX_ID
	});
}

// Register a random subset of players per tournament. Max is never an attendee —
// he's the demo's "no tournaments yet" persona, so his By-Tournament stats stay
// empty and the "Matchmake Now!" button shows for him. The CASUAL_PLAYERS cohort
// is excluded for the same reason, giving the `non-tournament-players` LD
// segment a real population rather than just Max and test1.
const nonMaxUsers = demoUsers.filter((u) => u.id !== MAX_ID && !casualOnlyIds.has(u.id));
export const demoAttendees: DemoAttendee[] = [];
for (const t of demoTournaments) {
	const target = randomInt(2, 12, rng);
	const chosen = new Set<string>();
	while (chosen.size < target) {
		chosen.add(randomItem(nonMaxUsers, rng).id);
	}
	for (const userId of chosen) {
		demoAttendees.push({ tournamentId: t.id, userId, registeredAt: randomPastDate(120, rng) });
	}
}

const attendeesByTournament = new Map<number, string[]>();
for (const a of demoAttendees) {
	const list = attendeesByTournament.get(a.tournamentId) ?? [];
	list.push(a.userId);
	attendeesByTournament.set(a.tournamentId, list);
}

let nextMatchId = 1;
export const demoMatches: DemoMatch[] = [];

// Build one match with random teams/scores/date; the caller decides the players
// and whether it's tied to a tournament.
function pushDemoMatch(player1Id: string, player2Id: string, tournamentId: number | null) {
	const player1Team = randomItem(demoTeams, rng);
	const player2Team = randomItem(demoTeams, rng);
	const p1 = randomScoreSet(rng);
	const p2 = randomScoreSet(rng);
	demoMatches.push({
		id: nextMatchId++,
		player1Id,
		player2Id,
		player1TeamId: player1Team.id,
		player2TeamId: player2Team.id,
		tournamentId,
		player1Crit: p1.crit,
		player1Tac: p1.tac,
		player1Kill: p1.kill,
		player1Primary: p1.primary,
		// Historical seeded matches predate the primary-op-choice concept, so it's
		// left unrecorded here, same as it would be for pre-existing real DB rows.
		player1PrimaryOpChoice: null,
		player2Crit: p2.crit,
		player2Tac: p2.tac,
		player2Kill: p2.kill,
		player2Primary: p2.primary,
		player2PrimaryOpChoice: null,
		playedAt: randomPastDate(180, rng)
	});
}

// Tournament matches: each event plays ceil(attendees / 2) matches, pairing its
// attendees so everyone plays at least once (an odd attendee out gets a rematch).
for (const t of demoTournaments) {
	const attendees = [...(attendeesByTournament.get(t.id) ?? [])];
	if (attendees.length < 2) continue;

	for (let i = attendees.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[attendees[i], attendees[j]] = [attendees[j], attendees[i]];
	}

	const matchCount = Math.ceil(attendees.length / 2);
	for (let k = 0; k < matchCount; k++) {
		const player1Id = attendees[2 * k];
		let player2Id = attendees[2 * k + 1];
		if (player2Id === undefined) {
			player2Id = randomItem(attendees, rng);
			while (player2Id === player1Id) {
				player2Id = randomItem(attendees, rng);
			}
		}
		pushDemoMatch(player1Id, player2Id, t.id);
	}
}

// Casual match history per user (never tied to a tournament).
for (const player1 of demoUsers) {
	const targetGames =
		player1.id === MAX_ID
			? STATIC_USER_MATCH_COUNT
			: randomInt(...RANDOM_MATCH_COUNT_RANGE, rng);

	for (let i = 0; i < targetGames; i++) {
		let player2 = randomItem(demoUsers, rng);
		while (player2.id === player1.id) {
			player2 = randomItem(demoUsers, rng);
		}
		pushDemoMatch(player1.id, player2.id, null);
	}
}

const teamById = new Map(demoTeams.map((t) => [t.id, t]));
const userById = new Map(demoUsers.map((u) => [u.id, u]));
const tournamentById = new Map(demoTournaments.map((t) => [t.id, t]));

function teamName(id: number): string {
	return teamById.get(id)?.name ?? 'Unknown Team';
}

function userName(id: string): string {
	return userById.get(id)?.name ?? 'Unknown Player';
}

function tournamentName(id: number | null): string | null {
	return id == null ? null : (tournamentById.get(id)?.name ?? null);
}

// Merges the deterministic seeded matches (regenerated in-memory on every cold
// start) with any additional matches a user has actually saved, which live in
// KV when it's configured (see kv.ts) or nowhere durable otherwise -- in which
// case there's nothing extra to merge in and this is just the seeded set.
async function getAllDemoMatches(): Promise<DemoMatch[]> {
	if (!isKvConfigured) return demoMatches;
	type StoredDemoMatch = Omit<DemoMatch, 'playedAt'> & { playedAt: string };
	const extra = await getKvMatches<StoredDemoMatch>();
	return [...demoMatches, ...extra.map((m) => ({ ...m, playedAt: new Date(m.playedAt) }))];
}

export async function getDemoLeaderboardRows() {
	const matches = await getAllDemoMatches();
	return matches.map((m) => ({
		player1Id: m.player1Id,
		player1Name: userName(m.player1Id),
		player2Id: m.player2Id,
		player2Name: userName(m.player2Id),
		player1TeamName: teamName(m.player1TeamId),
		player2TeamName: teamName(m.player2TeamId),
		player1Crit: m.player1Crit,
		player1Tac: m.player1Tac,
		player1Kill: m.player1Kill,
		player1Primary: m.player1Primary,
		player1PrimaryOpChoice: m.player1PrimaryOpChoice,
		player2Crit: m.player2Crit,
		player2Tac: m.player2Tac,
		player2Kill: m.player2Kill,
		player2Primary: m.player2Primary,
		player2PrimaryOpChoice: m.player2PrimaryOpChoice
	}));
}

export async function getDemoUserMatchRows(userId: string) {
	const matches = await getAllDemoMatches();
	return matches
		.filter((m) => m.player1Id === userId || m.player2Id === userId)
		.map((m) => ({
			id: m.id,
			tournament: tournamentName(m.tournamentId),
			playedAt: m.playedAt,
			player1Id: m.player1Id,
			player2Id: m.player2Id,
			player1Name: userName(m.player1Id),
			player2Name: userName(m.player2Id),
			player1TeamName: teamName(m.player1TeamId),
			player2TeamName: teamName(m.player2TeamId),
			player1Crit: m.player1Crit,
			player1Tac: m.player1Tac,
			player1Kill: m.player1Kill,
			player1Primary: m.player1Primary,
			player1PrimaryOpChoice: m.player1PrimaryOpChoice,
			player2Crit: m.player2Crit,
			player2Tac: m.player2Tac,
			player2Kill: m.player2Kill,
			player2Primary: m.player2Primary,
			player2PrimaryOpChoice: m.player2PrimaryOpChoice
		}))
		.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
}

export function getDemoTeams(): DemoTeam[] {
	return [...demoTeams].sort((a, b) => a.name.localeCompare(b.name));
}

export function getDemoOpponents(currentUserId: string): { id: string; name: string }[] {
	return demoUsers
		.filter((u) => u.id !== currentUserId)
		.map((u) => ({ id: u.id, name: u.name }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getDemoStatsRows(userId: string) {
	const matches = await getAllDemoMatches();
	return matches
		.filter((m) => m.player1Id === userId || m.player2Id === userId)
		.map((m) => ({
			player1Id: m.player1Id,
			player1TeamName: teamName(m.player1TeamId),
			player2TeamName: teamName(m.player2TeamId),
			tournamentId: m.tournamentId,
			tournamentName: tournamentName(m.tournamentId),
			player1Crit: m.player1Crit,
			player1Tac: m.player1Tac,
			player1Kill: m.player1Kill,
			player1Primary: m.player1Primary,
			player1PrimaryOpChoice: m.player1PrimaryOpChoice,
			player2Crit: m.player2Crit,
			player2Tac: m.player2Tac,
			player2Kill: m.player2Kill,
			player2Primary: m.player2Primary,
			player2PrimaryOpChoice: m.player2PrimaryOpChoice
		}));
}

export function getDemoUserName(userId: string): string | null {
	return userById.get(userId)?.name ?? null;
}

export async function addDemoMatch(input: {
	player1Id: string;
	player2Id: string;
	player1TeamId: number;
	player2TeamId: number;
	tournamentId: number | null;
	player1Crit: number;
	player1Tac: number;
	player1Kill: number;
	player1Primary: number;
	player1PrimaryOpChoice?: PrimaryOpChoice | null;
	player2Crit: number;
	player2Tac: number;
	player2Kill: number;
	player2Primary: number;
	player2PrimaryOpChoice?: PrimaryOpChoice | null;
}): Promise<void> {
	const newMatch: DemoMatch = {
		id: isKvConfigured ? await nextKvMatchId() : nextMatchId++,
		playedAt: new Date(),
		...input,
		player1PrimaryOpChoice: input.player1PrimaryOpChoice ?? null,
		player2PrimaryOpChoice: input.player2PrimaryOpChoice ?? null
	};
	if (isKvConfigured) {
		await pushKvMatch(newMatch);
	} else {
		demoMatches.push(newMatch);
	}
}

// Tournament dropdown options for the Log Match form — mirrors the real query in
// matches/+page.server.ts (id + name, newest first).
export function getDemoTournamentOptions(): { id: number; name: string }[] {
	return [...demoTournaments]
		.sort((a, b) => b.startDate.localeCompare(a.startDate))
		.map((t) => ({ id: t.id, name: t.name }));
}

// Tournaments list with derived attendee counts — mirrors tournaments/+page.server.ts.
export function getDemoTournaments() {
	const counts = new Map<number, number>();
	for (const a of demoAttendees) {
		counts.set(a.tournamentId, (counts.get(a.tournamentId) ?? 0) + 1);
	}
	return [...demoTournaments]
		.sort((a, b) => b.startDate.localeCompare(a.startDate))
		.map((t) => ({
			id: t.id,
			name: t.name,
			startDate: t.startDate,
			endDate: t.endDate,
			location: t.location,
			attendees: counts.get(t.id) ?? 0
		}));
}

// Tournament detail: the tournament, its attendees, and its match rows (raw —
// the route computes totals/result, same as the DB path). Returns null if the id
// doesn't exist, so the route can 404. Mirrors tournaments/[id]/+page.server.ts.
export async function getDemoTournamentDetail(id: number) {
	const tournament = tournamentById.get(id);
	if (!tournament) return null;

	const attendees = demoAttendees
		.filter((a) => a.tournamentId === id)
		.map((a) => ({ id: a.userId, name: userName(a.userId), registeredAt: a.registeredAt }))
		.sort((a, b) => a.name.localeCompare(b.name));

	const allMatches = await getAllDemoMatches();
	const matchRows = allMatches
		.filter((m) => m.tournamentId === id)
		.map((m) => ({
			id: m.id,
			playedAt: m.playedAt,
			player1Name: userName(m.player1Id),
			player2Name: userName(m.player2Id),
			player1TeamName: teamName(m.player1TeamId),
			player2TeamName: teamName(m.player2TeamId),
			player1Crit: m.player1Crit,
			player1Tac: m.player1Tac,
			player1Kill: m.player1Kill,
			player1Primary: m.player1Primary,
			player1PrimaryOpChoice: m.player1PrimaryOpChoice,
			player2Crit: m.player2Crit,
			player2Tac: m.player2Tac,
			player2Kill: m.player2Kill,
			player2Primary: m.player2Primary,
			player2PrimaryOpChoice: m.player2PrimaryOpChoice
		}))
		.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());

	return { tournament, attendees, matchRows };
}

let nextTournamentId = DEMO_TOURNAMENT_COUNT + 1;

// In-memory tournament create for demo mode — mirrors tournaments/new create action.
// Registers the creator as the first attendee so the detail page isn't empty.
export function addDemoTournament(input: {
	name: string;
	startDate: string;
	endDate: string;
	location: string;
	address: string | null;
	details: string | null;
	createdById: string;
}): void {
	const tournament: DemoTournament = { id: nextTournamentId++, ...input };
	demoTournaments.push(tournament);
	tournamentById.set(tournament.id, tournament);
	demoAttendees.push({
		tournamentId: tournament.id,
		userId: input.createdById,
		registeredAt: new Date()
	});
}
