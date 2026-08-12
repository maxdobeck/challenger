import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { team } from '$lib/server/db/schema';
import { getDemoTeamById } from '$lib/server/demo/data';
import { getUserMatchRows } from '$lib/server/match-history';
import { resolveTargetUser } from '$lib/server/target-user';
import { aggregateByTeam, toUserMatchViews } from '$lib/server/team-stats';

const DEMO_MODE = env.DEMO_MODE === 'true';

export const load: PageServerLoad = async (event) => {
	const currentUser = event.locals.user;
	if (!currentUser) {
		return redirect(302, '/login');
	}

	const id = Number(event.params.id);
	if (!Number.isInteger(id)) {
		return error(404, 'Team not found');
	}

	const foundTeam = DEMO_MODE
		? getDemoTeamById(id)
		: ((await db.select().from(team).where(eq(team.id, id)))[0] ?? null);
	if (!foundTeam) {
		return error(404, 'Team not found');
	}

	const { targetUserId, targetUserName, viewingOwnStats } = await resolveTargetUser(
		event,
		currentUser
	);

	const rows = await getUserMatchRows(targetUserId);
	const views = toUserMatchViews(rows, targetUserId);
	const teamStats = aggregateByTeam(views);

	const isMostPlayed = teamStats.length > 0 && teamStats[0].teamId === id;
	const summary = teamStats.find((t) => t.teamId === id) ?? {
		teamId: id,
		teamName: foundTeam.name,
		games: 0,
		wins: 0,
		losses: 0,
		draws: 0,
		winRate: 0
	};

	// This team's matches only, from the target user's perspective.
	const teamViews = views.filter((v) => v.teamId === id);

	const matches = [...teamViews].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());

	// Ascending by date, with a running win/loss net for the chart. Draws
	// hold the line flat but still appear as a marker at that point.
	let cumulativeNet = 0;
	const chartData = [...teamViews]
		.sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime())
		.map((v) => {
			if (v.result === 'win') cumulativeNet++;
			else if (v.result === 'loss') cumulativeNet--;
			return { playedAt: v.playedAt, result: v.result, cumulativeNet };
		});

	return {
		team: foundTeam,
		targetUserId,
		targetUserName,
		viewingOwnStats,
		isMostPlayed,
		summary,
		matches,
		chartData
	};
};
