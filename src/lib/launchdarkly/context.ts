// Client-safe LaunchDarkly context builders.
//
// IMPORTANT: this module runs in the browser (it reads `navigator`) and must
// never import from `$lib/server/*` or anything that pulls in `$env/*/private`,
// or SvelteKit will fail the client build. The profile/user shapes are declared
// locally rather than imported from the DB schema for the same reason.

export type LDProfile = { hasPlayedTournament: boolean; totalMatches: number };
export type LDUser = { id: string; name: string; email: string };

type Device = {
	type: 'mobile' | 'tablet' | 'desktop';
	os: 'ios' | 'android' | 'other';
	browser: 'chrome' | 'firefox' | 'safari' | 'other';
};

function detectDevice(): Device {
	const ua = navigator.userAgent;
	const isTablet = /iPad|Tablet/i.test(ua);
	const isMobile = /iPhone|Android|Mobile/i.test(ua);
	return {
		type: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop',
		os: /iPhone|iPad/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'other',
		// Order matters: Chrome's UA also contains "Safari", so test Chrome first.
		browser: /Firefox/.test(ua)
			? 'firefox'
			: /Chrome|CriOS/.test(ua)
				? 'chrome'
				: /Safari/.test(ua)
					? 'safari'
					: 'other'
	};
}

export function buildMultiContext(user: LDUser, profile: LDProfile) {
	const device = detectDevice();
	return {
		kind: 'multi' as const,
		user: {
			kind: 'user',
			key: user.id,
			name: user.name,
			anonymous: false,
			_meta: { privateAttributes: ['email'] },
			email: user.email,
			// Precomputed in Postgres — no extra query at login.
			hasPlayedTournament: profile.hasPlayedTournament,
			totalMatches: profile.totalMatches
		},
		device: {
			kind: 'device',
			key: `${device.os}-${device.browser}`,
			type: device.type,
			os: device.os,
			browser: device.browser
		}
	};
}

export function buildAnonymousContext() {
	const device = detectDevice();
	return {
		kind: 'multi' as const,
		user: {
			kind: 'user',
			key: 'anonymous',
			anonymous: true
		},
		device: {
			kind: 'device',
			key: `${device.os}-${device.browser}`,
			type: device.type,
			os: device.os,
			browser: device.browser
		}
	};
}
