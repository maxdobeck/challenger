import { describe, expect, it } from 'vitest';
import { computeTargetDimensions } from './imageDownscale';

describe('computeTargetDimensions', () => {
	it('downscales a landscape image so its long edge fits the limit', () => {
		expect(computeTargetDimensions(4032, 3024, 1568)).toEqual({ width: 1568, height: 1176 });
	});

	it('downscales a portrait image so its long edge fits the limit', () => {
		expect(computeTargetDimensions(3024, 4032, 1568)).toEqual({ width: 1176, height: 1568 });
	});

	it('downscales a square image so its long edge fits the limit', () => {
		expect(computeTargetDimensions(3000, 3000, 1568)).toEqual({ width: 1568, height: 1568 });
	});

	it('leaves an already-under-limit image unchanged', () => {
		expect(computeTargetDimensions(800, 600, 1568)).toEqual({ width: 800, height: 600 });
	});

	it('leaves an image exactly at the limit unchanged', () => {
		expect(computeTargetDimensions(1568, 1000, 1568)).toEqual({ width: 1568, height: 1000 });
	});

	it('never upscales', () => {
		const result = computeTargetDimensions(400, 300, 1568);
		expect(result.width).toBeLessThanOrEqual(400);
		expect(result.height).toBeLessThanOrEqual(300);
	});

	it('preserves aspect ratio within rounding', () => {
		const { width, height } = computeTargetDimensions(4032, 3024, 1568);
		expect(width / height).toBeCloseTo(4032 / 3024, 2);
	});

	it('respects a custom maxLongEdge', () => {
		expect(computeTargetDimensions(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
	});
});
