import { writable } from 'svelte/store';
import { initialize, type LDClient, type LDFlagChangeset } from 'launchdarkly-js-client-sdk';
// Dynamic (not static) so the build never fails when PUBLIC_LD_CLIENT_ID is
// absent — e.g. CI/e2e builds without the env var. It's read at runtime and
// simply undefined when unset, which initLD() guards against below.
import { env } from '$env/dynamic/public';
import { buildAnonymousContext } from '$lib/launchdarkly/context';

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
	const clientId = env.PUBLIC_LD_CLIENT_ID;
	if (!clientId || client) return;
	client = initialize(clientId, buildAnonymousContext(), { streaming: true });
	await client.waitForInitialization(5);
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
