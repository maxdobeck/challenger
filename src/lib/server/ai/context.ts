import type { LDContext } from '@launchdarkly/node-server-sdk';

// Server-side counterpart to $lib/launchdarkly/context.ts's buildMultiContext.
// That module is browser-only (it reads `navigator` for device detection) and
// must stay that way, so this is a separate, minimal implementation rather
// than a shared function -- just the `user` kind, which is what AI Config
// targeting needs.

export type ServerLDUser = { id: string; name: string; email: string };
export type ServerLDProfile = { hasPlayedTournament: boolean; totalMatches: number };

export function buildServerContext(user: ServerLDUser, profile: ServerLDProfile): LDContext {
	return {
		kind: 'user',
		key: user.id,
		name: user.name,
		anonymous: false,
		_meta: { privateAttributes: ['email'] },
		email: user.email,
		hasPlayedTournament: profile.hasPlayedTournament,
		totalMatches: profile.totalMatches
	};
}
