import { writable } from 'svelte/store';
import { initialize, type LDClient, type LDFlagChangeset } from 'launchdarkly-js-client-sdk';
import { PUBLIC_LD_CLIENT_ID } from '$env/static/public';
import { buildAnonymousContext } from '$lib/launchdarkly/context';

let client: LDClient | null = null;

/** Reactive map of all flag values. Read as `$flags['flag-key']` in components. */
export const flags = writable<Record<string, unknown>>({});

/** Flips true once the LD client has its first set of flag values. */
export const ldReady = writable(false);

/**
 * Initialize the LD client once, anonymously. Safe to call more than once
 * (subsequent calls are no-ops) and a no-op when no client id is configured,
 * so local dev without LaunchDarkly still runs.
 */
export async function initLD() {
	if (!PUBLIC_LD_CLIENT_ID || client) return;
	client = initialize(PUBLIC_LD_CLIENT_ID, buildAnonymousContext(), { streaming: true });
	await client.waitForInitialization(5);
	flags.set(client.allFlags());
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
}

/** Revert to the anonymous context after logout. */
export async function resetToAnonymous() {
	if (!client) return;
	await client.identify(buildAnonymousContext());
	flags.set(client.allFlags());
}
