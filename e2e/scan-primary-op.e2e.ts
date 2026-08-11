import { expect, test } from '@playwright/test';
import { loginAsMax } from './helpers';

// A minimal 1x1 JPEG — enough to pass the client's `file.type` check and
// canvas-compression pipeline; the scan response itself is stubbed below so
// this test never depends on a real ANTHROPIC_API_KEY or a real photo.
const TEST_JPEG_BASE64 =
	'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

test.beforeEach(async ({ page }) => {
	await loginAsMax(page);
});

test('scanned primary OP is always ceil(chosen category / 2)', async ({ page }) => {
	// Stub the scan endpoint — this test is about the client-side primary-OP
	// arithmetic in ScorePhotoScan.svelte, not the Anthropic call, so it never
	// needs a real ANTHROPIC_API_KEY or a real tracker photo.
	await page.route('**/matches/scan', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ crit_op: 4, kill_op: 2, tac_op: 6 })
		});
	});

	await page.goto('/matches');

	// Scope to the "You" scan panel — there's an identical one for Opponent.
	const scanPanel = page.locator('.scan-panel').first();
	await scanPanel.locator('input[type="file"]').setInputFiles({
		name: 'tracker.jpg',
		mimeType: 'image/jpeg',
		buffer: Buffer.from(TEST_JPEG_BASE64, 'base64')
	});

	const critInput = scanPanel.getByLabel('Crit (0-6)');
	await expect(critInput).toHaveValue('4');

	// Pick "crit" as the primary category, then sweep it through every
	// possible score and check the game rule holds at each one:
	// Primary OP = ceil(chosen category / 2).
	await scanPanel.getByRole('radio', { name: 'crit' }).check();

	for (const value of [0, 1, 2, 3, 4, 5, 6]) {
		await critInput.fill(String(value));
		const expected = Math.ceil(value / 2);
		await expect(
			scanPanel.getByText(`Primary OP = ceil(${value} / 2) = ${expected}`)
		).toBeVisible();
	}

	// Applying should write that exact computed value into the real Primary
	// field the "Log a Match" form submits — crit was left at 6 by the loop
	// above, so ceil(6 / 2) = 3.
	await scanPanel.getByRole('button', { name: "Apply to You's scores" }).click();
	await expect(page.locator('input[name="player1Primary"]')).toHaveValue('3');
	await expect(page.locator('input[name="player1Crit"]')).toHaveValue('6');

	// Re-scan and repeat with "kill" as the primary category to confirm the
	// same rule holds regardless of which category was chosen or how the
	// score got there (this time via the stubbed scan response, not typing).
	await scanPanel.locator('input[type="file"]').setInputFiles({
		name: 'tracker-2.jpg',
		mimeType: 'image/jpeg',
		buffer: Buffer.from(TEST_JPEG_BASE64, 'base64')
	});
	const killInput = scanPanel.getByLabel('Kill (0-6)');
	await expect(killInput).toHaveValue('2'); // kill_op from the stubbed response

	await scanPanel.getByRole('radio', { name: 'kill' }).check();
	await expect(scanPanel.getByText(`Primary OP = ceil(2 / 2) = ${Math.ceil(2 / 2)}`)).toBeVisible();

	for (const value of [1, 3, 5]) {
		await killInput.fill(String(value));
		const expected = Math.ceil(value / 2);
		await expect(
			scanPanel.getByText(`Primary OP = ceil(${value} / 2) = ${expected}`)
		).toBeVisible();
	}
});
