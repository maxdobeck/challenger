import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const SCORE_TOOL = {
	name: 'record_scoreboard_reading',
	description: 'Record the Crit, Kill, and Tac values read off the scoreboard screenshot.',
	input_schema: {
		type: 'object',
		properties: {
			crit_op: { type: 'integer', minimum: 0, maximum: 6, description: 'Crit value, 0-6' },
			kill_op: { type: 'integer', minimum: 0, maximum: 6, description: 'Kill value, 0-6' },
			tac_op: { type: 'integer', minimum: 0, maximum: 6, description: 'Tac value, 0-6' }
		},
		required: ['crit_op', 'kill_op', 'tac_op']
	}
} satisfies Anthropic.Tool;

export type ScoreboardReading = { crit_op: number; kill_op: number; tac_op: number };

// Reads Crit/Kill/Tac off a scoreboard screenshot via Claude vision. `base64Png`
// is the already-PNG-encoded image (the client re-encodes every upload to PNG
// before sending it, so the media type here is fixed, not sniffed). Uses a
// forced tool call rather than free-text + JSON.parse so the response shape is
// guaranteed to match ScoreboardReading.
export async function scanScoreboardImage(base64Png: string): Promise<ScoreboardReading> {
	const response = await anthropic.messages.create({
		model: 'claude-haiku-4-5',
		max_tokens: 256,
		tools: [SCORE_TOOL],
		tool_choice: { type: 'tool', name: SCORE_TOOL.name },
		messages: [
			{
				role: 'user',
				content: [
					{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Png } },
					{ type: 'text', text: 'Read the Crit, Kill, and Tac values off this scoreboard screenshot.' }
				]
			}
		]
	});

	const toolUse = response.content.find((block) => block.type === 'tool_use');
	if (!toolUse) {
		throw new Error('Model did not return a structured reading');
	}

	const input = toolUse.input as Partial<ScoreboardReading>;
	if (
		typeof input.crit_op !== 'number' ||
		typeof input.kill_op !== 'number' ||
		typeof input.tac_op !== 'number'
	) {
		throw new Error('Model returned an incomplete reading');
	}

	return { crit_op: input.crit_op, kill_op: input.kill_op, tac_op: input.tac_op };
}
