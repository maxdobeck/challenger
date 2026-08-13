import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { loginAsMax } from '../helpers';

// Every other Quick Upload test (e2e/quick-upload-chat.e2e.ts) mocks
// /matches/scan/chat wholesale, which means the server-side half of a photo
// turn -- reading the blob, base64-encoding it, resolving its media type and
// assembling the Anthropic image content block in
// src/routes/matches/scan/chat/+server.ts -- is never actually executed
// there. This test drives that path unmocked against the real endpoint using
// the same real 12MP phone photo as the sibling scan test.
//
// Without ANTHROPIC_API_KEY it exercises the mocked-model fallback in
// runScoreChatTurn (still proving the upload, route and content assembly
// work); with a key set it's a genuine round-trip through Claude.
//
// Tagged @ai and excluded from package.json's test:e2e (grep-invert
// "@traffic|@ai") for the same reasons as real-photo-scan.e2e.ts: a large
// binary fixture plus slow, CPU-bound browser-side re-encoding, and
// optionally a billable model call. Run deliberately with
// `npm run test:e2e:ai`.
test.describe('sending a real photo through the score chat', { tag: '@ai' }, () => {
	test('a photo turn reaches the chat endpoint and comes back as a reading', async ({ page }) => {
		// The 60s expect timeouts below are unreachable under Playwright's
		// default 30s per-test budget, so the test always timed out before its
		// own assertions could -- raise the test to fit them.
		test.setTimeout(150_000);

		const pageErrors: Error[] = [];
		page.on('pageerror', (err) => pageErrors.push(err));

		await loginAsMax(page);
		await page.goto('/matches/quick-upload');

		// The file input is server-rendered but its change handler only exists
		// once Svelte hydrates — setting files before then fires a change event
		// nothing is listening for (see e2e/ai-score-scan.e2e.ts).
		await page.waitForLoadState('networkidle');

		const photo = readFileSync('e2e/ai/fixtures/turning-point-tracker.jpg');
		await page.getByLabel('Choose File / Take Photo', { exact: true }).setInputFiles({
			name: 'turning-point-tracker.jpg',
			mimeType: 'image/jpeg',
			buffer: photo
		});

		// Real client-side re-encoding of a 12MP photo plus a real model call —
		// generous timeout, same reasoning as the sibling scan test's 30s.
		await expect(page.getByTestId('reading-you')).toBeVisible({ timeout: 60_000 });
		await expect(page.getByTestId('reading-you')).toContainText(/Crit \d/, { timeout: 60_000 });

		expect(pageErrors).toEqual([]);
	});
});
