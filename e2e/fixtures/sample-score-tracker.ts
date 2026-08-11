// A minimal, valid 1x1 PNG used to stand in for a photo of a score tracker.
// ScorePhotoScan really decodes/re-encodes the upload via createImageBitmap
// + canvas before it's sent, so this needs to be a genuinely decodable
// image -- a well-known tiny PNG keeps the tests offline and deterministic
// rather than depending on a generated or checked-in binary file.
const SAMPLE_SCORE_TRACKER_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export function sampleScoreTrackerImageBuffer(): Buffer {
	return Buffer.from(SAMPLE_SCORE_TRACKER_PNG_BASE64, 'base64');
}
