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
// This started as a reproduction of a real "Scan failed (413)" report. The
// client always re-encodes the upload as full-resolution lossless PNG with no
// size check before sending (ScorePhotoScan.svelte), which pushed this photo's
// re-encoded size above the server's old MAX_IMAGE_BYTES guard (5MB) too.
// That guard is now 20MB (src/routes/matches/scan/+server.ts), under which
// this specific photo's re-encode fits — confirmed by actually measuring it:
// it landed somewhere in the 5-20MB range, since it failed the old 5MB limit
// and passes the new 20MB one.
//
// IMPORTANT: this does NOT mean the originally reported 413 is fixed. A
// genuine 413 is a Vercel serverless function payload-size rejection
// (~4.5MB), enforced at the platform layer *before* the request reaches this
// app's code — i.e. below both the old 5MB and the new 20MB guard. This exact
// photo, re-encoded, almost certainly still exceeds ~4.5MB and would still
// 413 on the real deployment today. Local Playwright runs (vite preview, not
// adapter-vercel) can't reproduce that platform ceiling at all, so this test
// can only assert on the app's own (now more permissive) local behavior, not
// on whether the real-world bug is resolved. The actual fix is client-side
// downscaling/compression before upload, which hasn't been done.
//
// Tagged @ai and excluded from package.json's test:e2e (grep-invert
// "@traffic|@ai") because it ships a large binary fixture and depends on
// browser-side canvas re-encoding taking real (slow, CPU-bound) time — not
// suitable for every CI run. Run deliberately with `npm run test:e2e:ai`.
test.describe('scanning a real oversized phone photo', { tag: '@ai' }, () => {
	test('a real 12MP phone photo scans successfully under the 20MB guard', async ({ page }) => {
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
		// No ANTHROPIC_API_KEY locally, so a successful pass here means it got
		// past the size guard and hit the mocked-AI fallback (src/lib/server/ai/shared.ts).
		const scanResults = group.locator('.scan-results');
		await expect(scanResults).toBeVisible({ timeout: 30_000 });

		expect(pageErrors).toEqual([]);
	});
});
