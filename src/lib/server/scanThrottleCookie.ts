import type { Cookies } from '@sveltejs/kit';
import { SCAN_LIMIT_PER_DAY } from './scanThrottle';

const COOKIE_NAME = 'scan_count';
const WINDOW_MS = 24 * 60 * 60 * 1000;

type ScanCookieState = { count: number; windowStart: number };

function parseCookie(raw: string | undefined): ScanCookieState | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed.count === 'number' && typeof parsed.windowStart === 'number') {
			return parsed;
		}
	} catch {
		// Malformed/tampered cookie -- treat as no history rather than erroring.
	}
	return null;
}

// Demo-mode's cookie-carried counterpart to scanThrottle.ts's DB-backed
// isThrottled() -- same 20-scans-per-24h policy, tracked client-side since
// demo mode has no durable per-user server store to query (see Plan 1's
// "Deployment reality" notes on Vercel serverless + DEMO_MODE).
export function isThrottledByCookie(cookies: Cookies): boolean {
	const state = parseCookie(cookies.get(COOKIE_NAME));
	if (!state) return false;
	const withinWindow = Date.now() - state.windowStart < WINDOW_MS;
	return withinWindow && state.count >= SCAN_LIMIT_PER_DAY;
}

export function recordScanInCookie(cookies: Cookies): void {
	const now = Date.now();
	const state = parseCookie(cookies.get(COOKIE_NAME));
	const withinWindow = !!state && now - state.windowStart < WINDOW_MS;
	const next: ScanCookieState = withinWindow
		? { count: state!.count + 1, windowStart: state!.windowStart }
		: { count: 1, windowStart: now };
	cookies.set(COOKIE_NAME, JSON.stringify(next), {
		path: '/',
		maxAge: WINDOW_MS / 1000,
		httpOnly: true,
		sameSite: 'lax'
	});
}
