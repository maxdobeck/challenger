import * as LaunchDarkly from '@launchdarkly/node-server-sdk';
import { initAi, type LDAIClient } from '@launchdarkly/server-sdk-ai';
import { env } from '$env/dynamic/private';

// Lazily initialized so importing this module has no side effects when no SDK
// key is configured -- the expected state today, including in the real
// deployment (see Plan 1's "Deployment reality" notes: DEMO_MODE=true is what
// actually runs, and no server-side LD key is set there yet).
let clientPromise: Promise<LaunchDarkly.LDClient | null> | null = null;
let aiClient: LDAIClient | null = null;

async function getLdClient(): Promise<LaunchDarkly.LDClient | null> {
	if (!env.LAUNCHDARKLY_SDK_KEY) return null;
	if (!clientPromise) {
		const client = LaunchDarkly.init(env.LAUNCHDARKLY_SDK_KEY);
		clientPromise = client
			.waitForInitialization({ timeout: 5 })
			.then(() => client)
			.catch(() => null);
	}
	return clientPromise;
}

// Returns null when LaunchDarkly isn't configured or fails to initialize --
// callers fall back to a local default AI Config in that case, same "real if
// configured, mocked otherwise" seam used for the Anthropic key and for KV.
export async function getAiClient(): Promise<LDAIClient | null> {
	const ldClient = await getLdClient();
	if (!ldClient) return null;
	if (!aiClient) aiClient = initAi(ldClient);
	return aiClient;
}

// Fires a custom LD metric event (the base client's track(), not the AI-config
// tracker) -- a no-op when LaunchDarkly isn't configured. Used for data the
// AI-tracker API has no field for, e.g. a human's corrected score values.
export async function trackEvent(
	key: string,
	context: LaunchDarkly.LDContext,
	data?: unknown
): Promise<void> {
	const client = await getLdClient();
	client?.track(key, context, data);
}
