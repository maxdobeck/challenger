import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserMatchRows } from '$lib/server/match-history';
import { winRate } from '$lib/server/scoring';
import { resolveTargetUser } from '$lib/server/target-user';
import { aggregateByTeam, aggregateByTournament, toUserMatchViews } from '$lib/server/team-stats';

export const load: PageServerLoad = async (event) => {
	const currentUser = event.locals.user;
	if (!currentUser) {
		return redirect(302, '/login');
	}

	const { targetUserId, targetUserName, viewingOwnStats } = await resolveTargetUser(
		event,
		currentUser
	);

	const rows = await getUserMatchRows(targetUserId);
	const views = toUserMatchViews(rows, targetUserId);

	const teamStats = aggregateByTeam(views);
	const tournamentStats = aggregateByTournament(views);

	const totalGames = views.length;
	const totalWins = views.filter((v) => v.result === 'win').length;
	const totalLosses = views.filter((v) => v.result === 'loss').length;
	const totalDraws = views.filter((v) => v.result === 'draw').length;

	const favoriteTeam = teamStats[0]
		? { id: teamStats[0].teamId, name: teamStats[0].teamName }
		: null;

	return {
		teamStats,
		tournamentStats,
		summary: {
			totalGames,
			totalWins,
			totalLosses,
			totalDraws,
			winRate: winRate(totalWins, totalGames),
			favoriteTeam
		},
		viewingOwnStats,
		targetUserId,
		playerName: targetUserName
	};
};
