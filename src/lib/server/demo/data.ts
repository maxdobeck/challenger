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
	randomScoreSet,
	type Rng
} from '$lib/server/db/demo-fixtures';

type DemoUser = { id: string; name: string; email: string };
type DemoTeam = { id: number; name: string };
type DemoMatch = {
	id: number;
	player1Id: string;
	player2Id: string;
	player1TeamId: number;
	player2TeamId: number;
	tournament: string | null;
	player1Crit: number;
	player1Tac: number;
	player1Kill: number;
	player1Primary: number;
	player2Crit: number;
	player2Tac: number;
	player2Kill: number;
	player2Primary: number;
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

export const demoTeams: DemoTeam[] = teamNames.map((name, index) => ({ id: index + 1, name }));

export const demoUsers: DemoUser[] = [
	{ id: MAX_ID, name: STATIC_USER.name, email: STATIC_USER.email },
	...FAKE_PLAYERS.map((name, index) => ({
		id: `demo-player-${index + 1}`,
		name,
		email: `${name.toLowerCase().replace(/\s+/g, '.')}@killteam.example`
	}))
];

export const DEMO_USER = {
	id: MAX_ID,
	name: STATIC_USER.name,
	email: STATIC_USER.email,
	emailVerified: true,
	image: null,
	createdAt: new Date('2026-01-01T00:00:00Z'),
	updatedAt: new Date('2026-01-01T00:00:00Z')
};

let nextMatchId = 1;
export const demoMatches: DemoMatch[] = [];

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

		const player1Team = randomItem(demoTeams, rng);
		const player2Team = randomItem(demoTeams, rng);
		const p1 = randomScoreSet(rng);
		const p2 = randomScoreSet(rng);

		demoMatches.push({
			id: nextMatchId++,
			player1Id: player1.id,
			player2Id: player2.id,
			player1TeamId: player1Team.id,
			player2TeamId: player2Team.id,
			tournament: randomItem(TOURNAMENT_NAMES, rng),
			player1Crit: p1.crit,
			player1Tac: p1.tac,
			player1Kill: p1.kill,
			player1Primary: p1.primary,
			player2Crit: p2.crit,
			player2Tac: p2.tac,
			player2Kill: p2.kill,
			player2Primary: p2.primary,
			playedAt: randomPastDate(180, rng)
		});
	}
}

const teamById = new Map(demoTeams.map((t) => [t.id, t]));
const userById = new Map(demoUsers.map((u) => [u.id, u]));

function teamName(id: number): string {
	return teamById.get(id)?.name ?? 'Unknown Team';
}

function userName(id: string): string {
	return userById.get(id)?.name ?? 'Unknown Player';
}

export function getDemoLeaderboardRows() {
	return demoMatches.map((m) => ({
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
		player2Crit: m.player2Crit,
		player2Tac: m.player2Tac,
		player2Kill: m.player2Kill,
		player2Primary: m.player2Primary
	}));
}

export function getDemoUserMatchRows(userId: string) {
	return demoMatches
		.filter((m) => m.player1Id === userId || m.player2Id === userId)
		.map((m) => ({
			id: m.id,
			tournament: m.tournament,
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
			player2Crit: m.player2Crit,
			player2Tac: m.player2Tac,
			player2Kill: m.player2Kill,
			player2Primary: m.player2Primary
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

export function getDemoStatsRows(userId: string) {
	return demoMatches
		.filter((m) => m.player1Id === userId || m.player2Id === userId)
		.map((m) => ({
			player1Id: m.player1Id,
			player1TeamName: teamName(m.player1TeamId),
			player2TeamName: teamName(m.player2TeamId),
			player1Crit: m.player1Crit,
			player1Tac: m.player1Tac,
			player1Kill: m.player1Kill,
			player1Primary: m.player1Primary,
			player2Crit: m.player2Crit,
			player2Tac: m.player2Tac,
			player2Kill: m.player2Kill,
			player2Primary: m.player2Primary
		}));
}

export function getDemoUserName(userId: string): string | null {
	return userById.get(userId)?.name ?? null;
}

export function addDemoMatch(input: {
	player1Id: string;
	player2Id: string;
	player1TeamId: number;
	player2TeamId: number;
	tournament: string | null;
	player1Crit: number;
	player1Tac: number;
	player1Kill: number;
	player1Primary: number;
	player2Crit: number;
	player2Tac: number;
	player2Kill: number;
	player2Primary: number;
}): void {
	demoMatches.push({
		id: nextMatchId++,
		playedAt: new Date(),
		...input
	});
}
