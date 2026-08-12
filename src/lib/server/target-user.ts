// Resolves the `?user=<id>` query param used by /stats and /teams/[id] to
// let a signed-in player view another player's data, falling back to their
// own. Extracted from /stats's original inline implementation so both
// routes share one 404-on-unknown-user behavior.

import { error, type RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { getDemoUserName } from '$lib/server/demo/data';

const DEMO_MODE = env.DEMO_MODE === 'true';

export type TargetUser = {
	targetUserId: string;
	targetUserName: string;
	viewingOwnStats: boolean;
};

export async function resolveTargetUser(
	event: RequestEvent,
	currentUser: { id: string; name: string }
): Promise<TargetUser> {
	const requestedUserId = event.url.searchParams.get('user');
	const viewingOwnStats = !requestedUserId || requestedUserId === currentUser.id;
	const targetUserId = viewingOwnStats ? currentUser.id : requestedUserId;

	if (viewingOwnStats) {
		return { targetUserId, targetUserName: currentUser.name, viewingOwnStats };
	}

	if (DEMO_MODE) {
		const name = getDemoUserName(targetUserId);
		if (!name) {
			return error(404, 'Player not found');
		}
		return { targetUserId, targetUserName: name, viewingOwnStats };
	}

	const [targetUser] = await db.select({ name: user.name }).from(user).where(eq(user.id, targetUserId));
	if (!targetUser) {
		return error(404, 'Player not found');
	}
	return { targetUserId, targetUserName: targetUser.name, viewingOwnStats };
}
