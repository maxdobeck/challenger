// Anthropic's Vision API downscales anything larger than this server-side
// before the model ever sees it, so sending more is pure waste, not just a
// size risk (docs.claude.com/en/docs/build-with-claude/vision).
export const MAX_LONG_EDGE_PX = 1568;

// The scan prompt (src/lib/server/ai/scoreVision.ts) asks the model to read
// a magnet's position on a printed scale -- a coarse, large-area-contrast
// task, not dense text OCR -- so a moderate JPEG quality trades size for
// fidelity safely.
export const JPEG_QUALITY = 0.85;

export type TargetDimensions = { width: number; height: number };

// Pure, DOM-free dimension math so it's unit-testable without a browser:
// scales width/height down (never up) so the long edge is at most
// maxLongEdge, preserving aspect ratio.
export function computeTargetDimensions(
	width: number,
	height: number,
	maxLongEdge: number = MAX_LONG_EDGE_PX
): TargetDimensions {
	const longEdge = Math.max(width, height);
	const scale = Math.min(1, maxLongEdge / longEdge);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}

// Decodes an uploaded image File, downscales it (only if needed) to at most
// MAX_LONG_EDGE_PX on its long edge, and re-encodes it as a compressed JPEG
// Blob ready to upload. Throws a user-facing Error for the failure modes
// callers already handle inline (unreadable image, no canvas support,
// encode failure).
export async function downscaleImageForUpload(
	file: File,
	opts: { maxLongEdge?: number; quality?: number } = {}
): Promise<Blob> {
	const maxLongEdge = opts.maxLongEdge ?? MAX_LONG_EDGE_PX;
	const quality = opts.quality ?? JPEG_QUALITY;

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		throw new Error("Couldn't read that image — try a PNG or JPEG screenshot instead.");
	}

	try {
		const { width, height } = computeTargetDimensions(bitmap.width, bitmap.height, maxLongEdge);

		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas is not supported in this browser.');
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(bitmap, 0, 0, width, height);

		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/jpeg', quality)
		);
		if (!blob) throw new Error('Could not encode the photo.');
		return blob;
	} finally {
		bitmap.close();
	}
}
