import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

// Decoded-bytes cap. Well under Vercel's request body limit even after
// base64 re-inflates it (~1.37x) -- the client already compresses to
// <=1024px JPEG before upload, so real requests land far below this.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const SCORE_PROMPT =
	'This is a photo of a Kill Team score tracker. Read the tracker and find the current ' +
	'values for three operative scoring categories: Crit Op, Kill Op, and Tac Op. Each value ' +
	'is an integer from 0 to 6. Respond with ONLY a JSON object in exactly this shape, no ' +
	'markdown formatting, no code fences, no explanation:\n' +
	'{"crit_op": <integer 0-6>, "kill_op": <integer 0-6>, "tac_op": <integer 0-6>}';

// Best-effort in-memory rate limit. Resets on cold start and isn't shared
// across serverless instances -- a deterrent against accidental abuse and
// runaway client bugs, not a hard guarantee.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const requestLog = new Map<string, number[]>();

function isRateLimited(clientId: string): boolean {
	const now = Date.now();
	const recent = (requestLog.get(clientId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
	recent.push(now);
	requestLog.set(clientId, recent);
	return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

function stripCodeFences(text: string): string {
	return text
		.trim()
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/```\s*$/i, '')
		.trim();
}

function isValidScore(n: unknown): n is number {
	return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 6;
}

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (isRateLimited(event.getClientAddress())) {
		return json(
			{ error: 'Too many requests. Please wait a moment and try again.' },
			{ status: 429 }
		);
	}

	const apiKey = env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		console.error('ANTHROPIC_API_KEY is not set');
		return json({ error: 'Photo scoring is not configured.' }, { status: 500 });
	}

	let body: { image?: unknown; mediaType?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	const { image, mediaType } = body;
	if (typeof image !== 'string' || !image) {
		return json({ error: 'Missing image.' }, { status: 400 });
	}
	if (typeof mediaType !== 'string' || !ALLOWED_MEDIA_TYPES.has(mediaType)) {
		return json({ error: 'Unsupported image type.' }, { status: 400 });
	}

	const decodedBytes = Math.ceil((image.length * 3) / 4);
	if (decodedBytes > MAX_IMAGE_BYTES) {
		return json({ error: 'Image is too large.' }, { status: 413 });
	}

	let anthropicResponse: Response;
	try {
		anthropicResponse = await fetch(ANTHROPIC_API_URL, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: MODEL,
				max_tokens: 200,
				messages: [
					{
						role: 'user',
						content: [
							{ type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
							{ type: 'text', text: SCORE_PROMPT }
						]
					}
				]
			})
		});
	} catch (err) {
		console.error('Anthropic request failed:', err);
		return json({ error: 'Could not reach the scoring service.' }, { status: 502 });
	}

	if (!anthropicResponse.ok) {
		const detail = await anthropicResponse.text().catch(() => '');
		console.error('Anthropic API error:', anthropicResponse.status, detail);
		return json({ error: 'The scoring service returned an error.' }, { status: 502 });
	}

	let payload: unknown;
	try {
		payload = await anthropicResponse.json();
	} catch (err) {
		console.error('Failed to parse Anthropic response as JSON:', err);
		return json({ error: 'The scoring service returned an unreadable response.' }, { status: 502 });
	}

	const content = (payload as { content?: Array<{ type: string; text?: string }> })?.content;
	const text = content?.find((block) => block.type === 'text')?.text;

	if (!text) {
		return json({ error: 'The scoring service did not return a result.' }, { status: 502 });
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(stripCodeFences(text));
	} catch (err) {
		console.error('Failed to parse model output as JSON:', text, err);
		return json(
			{ error: 'Could not read the scores from that photo. Try a clearer image.' },
			{ status: 502 }
		);
	}

	const { crit_op, kill_op, tac_op } = (parsed ?? {}) as Record<string, unknown>;
	if (!isValidScore(crit_op) || !isValidScore(kill_op) || !isValidScore(tac_op)) {
		return json(
			{ error: 'Could not read valid scores from that photo. Try a clearer image.' },
			{ status: 502 }
		);
	}

	return json({ crit_op, kill_op, tac_op });
};
