import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, jsonSchema, tool, type UserContent } from 'ai';
import { getAIMetricsFromResponse } from '@launchdarkly/server-sdk-ai-vercel';
import { env } from '$env/dynamic/private';
import { getAiClient, withLlmSpan, flushLdTelemetry } from './ldClient';
import { buildServerContext, type ServerLDUser, type ServerLDProfile } from './context';

export type ScoreScanResult = { crit: number; kill: number; tac: number };

function mockScoreResult(): ScoreScanResult {
	const roll = () => Math.floor(Math.random() * 7);
	return { crit: roll(), kill: roll(), tac: roll() };
}

// A forced tool call rather than free-text + JSON.parse guarantees the
// response shape matches ScoreScanResult -- proven more reliable than parsing
// a text block (see the original direct-Anthropic implementation this was
// ported from, commit 97b44e9).
const SCORE_TOOL_NAME = 'record_score_reading';
const SCORE_TOOL = tool({
	description: 'Record the Crit, Kill, and Tac values read or parsed from the input.',
	inputSchema: jsonSchema({
		type: 'object',
		properties: {
			crit: { type: 'integer', minimum: 0, maximum: 6, description: 'Crit value, 0-6' },
			kill: { type: 'integer', minimum: 0, maximum: 6, description: 'Kill value, 0-6' },
			tac: { type: 'integer', minimum: 0, maximum: 6, description: 'Tac value, 0-6' }
		},
		required: ['crit', 'kill', 'tac']
	})
});

function isPlausibleScoreResult(value: unknown): value is ScoreScanResult {
	return (
		!!value &&
		typeof value === 'object' &&
		typeof (value as ScoreScanResult).crit === 'number' &&
		typeof (value as ScoreScanResult).kill === 'number' &&
		typeof (value as ScoreScanResult).tac === 'number'
	);
}

// Shared by the vision (photo) and text (natural-language) score-parsing
// paths: both resolve a completion-mode AI Config for `aiConfigKey`, then --
// only if ANTHROPIC_API_KEY is actually set -- call the real model with the
// resolved (or default) model/prompt. Without a key, the model call itself is
// mocked, but the LD Config evaluation and tracking above it still run for
// real whenever LaunchDarkly is configured. This is the "real if configured,
// mocked otherwise" seam used throughout this feature (see also
// src/lib/server/demo/kv.ts and src/lib/server/scanThrottle.ts).
export async function runScoreCompletion(
	aiConfigKey: string,
	defaultModel: string,
	defaultPrompt: string,
	userContent: UserContent,
	user: ServerLDUser,
	profile: ServerLDProfile,
	requestHeaders?: Headers
): Promise<ScoreScanResult> {
	const context = buildServerContext(user, profile);
	const aiClient = await getAiClient();
	const aiConfig = aiClient
		? await aiClient.completionConfig(aiConfigKey, context, {
				model: { name: defaultModel },
				messages: [{ role: 'system', content: defaultPrompt }]
			})
		: null;
	const tracker = aiConfig?.createTracker();

	if (!env.ANTHROPIC_API_KEY) {
		tracker?.trackSuccess();
		// Returns without going through withLlmSpan, so this path has to flush
		// its own event or the serverless invocation freezes on top of it.
		await flushLdTelemetry();
		return mockScoreResult();
	}

	const modelName = aiConfig?.model?.name ?? defaultModel;
	const systemPrompt = aiConfig?.messages?.[0]?.content ?? defaultPrompt;

	// Running inside a span is what lets LaunchDarkly associate a trace with
	// this AI Config -- the tracker records metrics, but metrics alone carry no
	// trace association. See scoreChat.ts's runScoreChatTurn for the same pattern.
	return withLlmSpan(`llm.${aiConfigKey}`, requestHeaders, async (setSpanAttributes) => {
		setSpanAttributes({
			'launchdarkly.ai.config.key': aiConfigKey,
			'gen_ai.request.model': modelName,
			'gen_ai.system': 'anthropic'
		});

		const model = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(modelName);
		// Validating inside the tracked call is deliberate: trackMetricsOf records
		// duration, tokens and success/error around whatever this returns, so a
		// malformed structured result is reported as a failed run rather than a
		// successful one that happened to throw afterwards.
		const call = async () => {
			const response = await generateText({
				model,
				maxOutputTokens: 256,
				system: systemPrompt,
				tools: { [SCORE_TOOL_NAME]: SCORE_TOOL },
				toolChoice: { type: 'tool', toolName: SCORE_TOOL_NAME },
				messages: [{ role: 'user', content: userContent }]
			});
			const parsed = response.toolCalls[0]?.input ?? null;
			if (!isPlausibleScoreResult(parsed)) {
				throw new Error('Model did not return a structured reading.');
			}
			return { response, parsed };
		};

		const { response, parsed } = tracker
			? await tracker.trackMetricsOf((r) => getAIMetricsFromResponse(r.response), call)
			: await call();

		setSpanAttributes({
			'gen_ai.usage.input_tokens': response.usage?.inputTokens ?? 0,
			'gen_ai.usage.output_tokens': response.usage?.outputTokens ?? 0
		});

		return parsed;
	});
}
