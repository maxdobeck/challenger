import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { loginAsMax } from '../helpers';

// Every other scan test (e2e/ai-score-scan.e2e.ts, e2e/quick-upload-chat.e2e.ts)
// mocks the /matches/scan response with page.route, because the real Anthropic
// call isn't reachable in CI. This test does the opposite on purpose: it sends
// a real phone photo (2.65MB, 4032x3024 — e2e/ai/fixtures/turning-point-tracker.jpg)
// through the actual client pipeline with no mock, to exercise
// ScorePhotoScan.svelte's real createImageBitmap -> canvas -> lossless-PNG
// re-encode -> POST /matches/scan flow end to end.
//
// This reproduces the bug behind a real "Scan failed (413)" report: the client
// always re-encodes the upload as full-resolution lossless PNG with no size
// check before sending (ScorePhotoScan.svelte), and the server's own
// MAX_IMAGE_BYTES guard (src/routes/matches/scan/+server.ts) only runs after
// that re-encode already happened. A genuine 413 is a Vercel serverless
// function payload-size rejection (~4.5MB) that happens at the platform layer
// on the real deployment, below the app's own 5MB check — local Playwright
// runs (vite preview, not adapter-vercel) can't produce that exact status
// code. What *does* reproduce locally, confirmed by actually running this
// test against this photo: the PNG re-encode of this real photo exceeds the
// app's own 5MB limit, so it fails with the app's own `400 Image is too
// large.` — same root cause (lossless re-encode, no size guard before the
// canvas step), one layer earlier than the platform's 413. The client now
// surfaces that message verbatim (rather than a generic "Scan failed (400).")
// via ScorePhotoScan.svelte's error(status, message) JSON body parsing.
//
// Tagged @ai and excluded from package.json's test:e2e (grep-invert
// "@traffic|@ai") because it ships a large binary fixture and depends on
// browser-side canvas re-encoding taking real (slow, CPU-bound) time — not
// suitable for every CI run. Run deliberately with `npm run test:e2e:ai`.
test.describe('scanning a real oversized phone photo', { tag: '@ai' }, () => {
	test('a real 12MP phone photo fails the app\'s own size guard once re-encoded', async ({
		page
	}) => {
		const pageErrors: Error[] = [];
		page.on('pageerror', (err) => pageErrors.push(err));

		await loginAsMax(page);
		await page.goto('/matches');

		// The file input is server-rendered but its change handler only exists
		// once Svelte hydrates — setting files before then fires a change event
		// nothing is listening for (see e2e/ai-score-scan.e2e.ts).
		await page.waitForLoadState('networkidle');

		const group = page.getByRole('group', { name: 'You', exact: true });
		const photo = readFileSync('e2e/ai/fixtures/turning-point-tracker.jpg');
		await group.locator('input[type="file"]').setInputFiles({
			name: 'turning-point-tracker.jpg',
			mimeType: 'image/jpeg',
			buffer: photo
		});

		// Real client-side canvas re-encoding of a 12MP photo is slow, especially
		// under parallel workers — generous timeout, same reasoning as the
		// mocked scan tests' 15s waits, just larger for real (not stubbed) work.
		const scanError = group.locator('.error');
		await expect(scanError).toBeVisible({ timeout: 30_000 });
		await expect(scanError).toHaveText('Image is too large.');

		expect(pageErrors).toEqual([]);
	});
});
