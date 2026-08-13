import * as LaunchDarkly from '@launchdarkly/node-server-sdk';
import { initAi, type LDAIClient } from '@launchdarkly/server-sdk-ai';
import { Observability, LDObserve } from '@launchdarkly/observability-node';
import { env } from '$env/dynamic/private';

// Still lazy, so importing this module has no side effects when no SDK key is
// configured -- the expected state today, including in the real deployment
// (see Plan 1's "Deployment reality" notes: DEMO_MODE=true is what actually
// runs, and no server-side LD key is set there yet). `warmLdClient()` is the
// counterweight: when a key *is* set, hooks.server.ts calls it at module load
// so the observability plugin's auto-instrumentation is in place before the
// first request rather than starting mid-way through one.
let clientPromise: Promise<LaunchDarkly.LDClient | null> | null = null;
let aiClient: LDAIClient | null = null;

// The LDObserve singleton throws rather than no-ops when the plugin never
// registered (`runWithHeaders` dereferences an undefined client), so every
// call through it is gated on this.
let observabilityReady = false;

async function getLdClient(): Promise<LaunchDarkly.LDClient | null> {
	if (!env.LAUNCHDARKLY_SDK_KEY) return null;
	if (!clientPromise) {
		const client = LaunchDarkly.init(env.LAUNCHDARKLY_SDK_KEY, {
			// Auto-captures server errors, logs and traces, and -- the reason
			// it's here -- gives the model calls in scoreChat.ts an active
			// OpenTelemetry span. Tracking AI metrics alone does not associate
			// traces with the evaluated AI Config; LaunchDarkly only makes that
			// link when the model request runs inside a span.
			plugins: [
				new Observability({
					// Matches the browser-side Observability plugin in
					// $lib/stores/launchdarkly, so a browser trace and the
					// backend span it triggered land under one service. The
					// version is the deploy's git SHA, matching the sourcemaps
					// uploaded by `vercel-build`.
					serviceName: 'challenger',
					serviceVersion: __APP_VERSION__,
					environment: env.VERCEL_ENV || 'development'
				})
			]
		});
		// Set before the initialization await, not after: the plugin registers
		// during init(), so LDObserve is usable even if the connection to
		// LaunchDarkly never comes up.
		observabilityReady = true;
		clientPromise = client
			.waitForInitialization({ timeout: 5 })
			.then(() => client)
			.catch(() => null);
	}
	return clientPromise;
}

/**
 * Starts the LaunchDarkly client early, if one is configured at all.
 *
 * OpenTelemetry auto-instrumentation can only patch modules loaded after it
 * installs itself, so an SDK first initialized on the request that needs it
 * misses everything that request already did. Fire-and-forget by design --
 * nothing should block server startup on reaching LaunchDarkly.
 */
export function warmLdClient(): void {
	void getLdClient().catch(() => null);
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

/**
 * Runs `fn` inside an OpenTelemetry span, when observability is configured.
 *
 * `requestHeaders` carry the browser's trace context: the client-side
 * Observability plugin runs with `tracingOrigins: true`, so same-origin
 * fetches are already stamped with a traceparent. Passing them through is what
 * stitches this span onto the session that caused it instead of leaving it a
 * disconnected root.
 *
 * The flush is not optional on serverless: exporters batch, and Vercel can
 * freeze the function the moment the response is sent, which would drop the
 * span we just paid to record. Same reasoning as awaiting the judges in
 * scoreChat.ts. It runs in `finally` so a failed turn still reports its span.
 */
export async function withLlmSpan<T>(
	name: string,
	requestHeaders: Headers | undefined,
	fn: (setAttributes: (attributes: Record<string, string | number>) => void) => Promise<T>
): Promise<T> {
	await getLdClient();
	if (!observabilityReady) return fn(() => {});

	const headers = requestHeaders ? Object.fromEntries(requestHeaders) : {};
	try {
		return (await LDObserve.runWithHeaders(name, headers, async (span) => {
			return fn((attributes) => span.setAttributes(attributes));
		})) as T;
	} finally {
		await LDObserve.flush().catch(() => {});
	}
}
