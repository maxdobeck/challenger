import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { deleteE2eUsers, loginAsFreshUser } from '../helpers';

// This test started as a reproduction of a real "Scan failed (413)" report:
// ScorePhotoScan.svelte/ScoreChat.svelte used to always re-encode the upload
// as full-resolution lossless PNG with no size check, which could push a
// real phone photo's re-encoded size past Vercel's ~4.5MB serverless
// payload ceiling -- a platform-level rejection surfaced as a 413.
//
// That's now fixed for real, not worked around: $lib/imageDownscale's
// downscaleImageForUpload() downscales to Anthropic's own recommended
// ceiling (long edge <= 1568px, per docs.claude.com/en/docs/build-with-claude/vision)
// and re-encodes as JPEG (q0.85) before upload. Anthropic downscales
// server-side beyond that anyway, so there's never a legitimate reason to
// send more -- this isn't a size/quality tradeoff, it's eliminating pure
// waste. This test sends the same real phone photo used during the original
// investigation (2.65MB, 4032x3024 -- e2e/ai/fixtures/turning-point-tracker.jpg)
// through the actual unmocked client pipeline and measures what actually
// gets uploaded, confirming it now lands at a small fraction of both
// Vercel's ~4.5MB platform ceiling and Anthropic's 5MB base64 cap -- so the
// originally reported 413 can no longer occur for a photo this size (or
// larger; downscaling only gets more effective on bigger originals). The
// server's own MAX_IMAGE_BYTES guard (src/routes/matches/scan/+server.ts,
// now 3MiB, sized to Anthropic's cap) is not what's under test here -- this
// is specifically about the client no longer producing an oversized payload
// in the first place.
//
// Every other scan test (e2e/ai-score-scan.e2e.ts, e2e/quick-upload-chat.e2e.ts)
// mocks the /matches/scan response entirely, because the real Anthropic call
// isn't reachable in CI. This test intercepts the request only to measure
// its size, then lets it continue through to the real (mocked-AI-fallback,
// since no ANTHROPIC_API_KEY locally) endpoint -- exercising the real
// client-side encode pipeline end to end.
//
// Tagged @ai and excluded from package.json's test:e2e (grep-invert
// "@traffic|@ai") because it ships a large binary fixture and depends on
// browser-side canvas re-encoding taking real (slow, CPU-bound) time — not
// suitable for every CI run. Run deliberately with `npm run test:e2e:ai`.
test.describe('scanning a real oversized phone photo', { tag: '@ai' }, () => {
	const createdEmails: string[] = [];
	test.afterEach(async () => {
		await deleteE2eUsers(createdEmails.splice(0));
	});

	test('a real 12MP phone photo is downscaled to a small payload before upload', async ({
		page
	}) => {
		const pageErrors: Error[] = [];
		page.on('pageerror', (err) => pageErrors.push(err));

		const email = await loginAsFreshUser(page);
		if (email) createdEmails.push(email);
		await page.goto('/matches');

		// The file input is server-rendered but its change handler only exists
		// once Svelte hydrates — setting files before then fires a change event
		// nothing is listening for (see e2e/ai-score-scan.e2e.ts).
		await page.waitForLoadState('networkidle');

		// Registered after navigation, matching the rest of the suite's
		// convention (e.g. ai-score-scan.e2e.ts's mockScanResponse) — a route
		// registered before goto reliably hangs waitForLoadState('networkidle')
		// in this app/Playwright version combination.
		let uploadedBytes = -1;
		await page.route('**/matches/scan', async (route) => {
			uploadedBytes = route.request().postDataBuffer()?.length ?? -1;
			await route.continue();
		});

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
		const scanResults = group.locator('.scan-results');
		await expect(scanResults).toBeVisible({ timeout: 30_000 });

		expect(uploadedBytes).toBeGreaterThan(0);
		// Well under the app's own 3MiB guard and Anthropic's 5MB base64 cap —
		// a downscaled 1568px-long-edge JPEG at q0.85 typically lands in the
		// low hundreds of KB to ~1MB even for a busy/high-contrast photo.
		expect(uploadedBytes).toBeLessThan(2 * 1024 * 1024);

		expect(pageErrors).toEqual([]);
	});
});
