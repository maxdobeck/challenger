import { derived, writable, type Readable } from 'svelte/store';
import { initialize, type LDClient, type LDFlagChangeset } from 'launchdarkly-js-client-sdk';
// Observability and SessionReplay (the latter bundles rrweb) are the heaviest
// deps in the app. They're loaded via dynamic import() inside initLD() so the
// bundler splits them into their own chunks fetched at LD-init time, keeping
// them out of the initial page bundle.
// Dynamic (not static) so the build never fails when PUBLIC_LD_CLIENT_ID is
// absent — it's read at runtime and simply undefined when unset, which
// initLD() falls back from (see DEFAULT_LD_CLIENT_ID below).
import { env } from '$env/dynamic/public';
import { buildAnonymousContext } from '$lib/launchdarkly/context';

// Client-side ID for the `challenger` LaunchDarkly production environment.
// Deliberately committed: client-side IDs are not secret — the SDK ships this
// string to every browser that loads the app — so hardcoding it means a fresh
// checkout, demo mode and CI all emit real flag evaluations with no env wiring
// at all. PUBLIC_LD_CLIENT_ID still overrides it, for pointing a deploy at a
// different LD environment.
const DEFAULT_LD_CLIENT_ID = '6a761baeb7c4670ad5fc4aee';

let client: LDClient | null = null;

/** Reactive map of all flag values. Read as `$flags['flag-key']` in components. */
export const flags = writable<Record<string, unknown>>({});

/** Flips true once the LD client has its first set of flag values. */
export const ldReady = writable(false);

/**
 * The context key whose flags are currently loaded in the `flags` store:
 * `'anonymous'` before login, the user's id after `identifyUser` resolves.
 * Lets callers (and e2e tests) know flag values reflect the identified user
 * rather than the anonymous context. */
export const ldContextKey = writable<string | null>(null);

/**
 * Initialize the LD client once, anonymously. Safe to call more than once
 * (subsequent calls are no-ops) and a no-op when no client id is configured,
 * so local dev without LaunchDarkly still runs.
 */
export async function initLD() {
	const clientId = env.PUBLIC_LD_CLIENT_ID || DEFAULT_LD_CLIENT_ID;
	if (!clientId || client) return;
	// Loaded on demand so they land in separate chunks rather than the initial bundle.
	const [{ default: Observability }, { default: SessionReplay }] = await Promise.all([
		import('@launchdarkly/observability'),
		import('@launchdarkly/session-replay')
	]);
	client = initialize(clientId, buildAnonymousContext(), {
		streaming: true,
		// Auto-captures frontend errors, console logs, web vitals, network
		// requests, and traces linking browser fetches to same-origin backend
		// routes. Rides the same anonymous → identified context lifecycle below.
		// SessionReplay records user sessions for playback in LaunchDarkly;
		// 'default' privacy masks inputs while keeping the replay useful.
		plugins: [
			// `version` is the deploy's git SHA (see vite.config `define`), matching
			// the sourcemaps uploaded to LD so production stack traces de-minify.
			new Observability({
				tracingOrigins: true,
				serviceName: 'challenger',
				version: __APP_VERSION__
			}),
			new SessionReplay({ privacySetting: 'default' })
		]
	});

	try {
		await client.waitForInitialization(5);
		console.log('LaunchDarkly client started!!!');
	} catch (err) {
		console.error('Launch Darkly error!!!: ', err);
	}

	flags.set(client.allFlags());
	ldContextKey.set('anonymous');
	ldReady.set(true);
	client.on('change', (changes: LDFlagChangeset) => {
		flags.update((current) => {
			const next = { ...current };
			for (const [key, { current: value }] of Object.entries(changes)) {
				next[key] = value;
			}
			return next;
		});
	});
}

/**
 * A single flag's value, read through `variation()` rather than the `flags`
 * store above.
 *
 * The distinction matters for Experimentation: `allFlags()` (which fills
 * `flags`) is a bulk local read that sends nothing to LaunchDarkly, while
 * `variation()` emits an evaluation event — and that event *is* the experiment
 * exposure. A flag rule with an experiment rollout only enrols a context once
 * it has been evaluated, so anything gating on a flag under experiment must
 * read it through here or the experiment never sees the subject.
 *
 * Re-evaluates when the client becomes ready, when the context changes
 * (anonymous → identified, so exposure is attributed to the real user key and
 * its attributes), and when a streamed update changes the value. Yields
 * `defaultValue` when no client is configured, so demo mode — where `initLD()`
 * no-ops — still renders.
 */
export function flagVariation<T>(key: string, defaultValue: T): Readable<T> {
	return derived([ldReady, ldContextKey, flags], () => {
		if (!client) return defaultValue;
		return client.variation(key, defaultValue) as T;
	});
}

/** Swap the anonymous context for a real identified multi-context after login. */
export async function identifyUser(context: object) {
	if (!client) return;
	await client.identify(context);
	flags.set(client.allFlags());
	const key = (context as { user?: { key?: string } }).user?.key ?? null;
	ldContextKey.set(key);
}

/** Revert to the anonymous context after logout. */
export async function resetToAnonymous() {
	if (!client) return;
	await client.identify(buildAnonymousContext());
	flags.set(client.allFlags());
	ldContextKey.set('anonymous');
}
