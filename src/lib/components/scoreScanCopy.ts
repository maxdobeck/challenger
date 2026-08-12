export type ScoreScanCopy = {
	// ScoreChat.svelte (chat-style flow, used on the quick-upload page)
	chooseInputPrompt: string;
	fileInputLabel: string;
	textInputPlaceholder: string;
	sendButtonAriaLabel: string;
	scanningLabel: string;
	reviewTallyMessage: string;
	reviewTallyPrompt: string;
	primaryCritLabel: string;
	primaryKillLabel: string;
	primaryTacLabel: string;
	confirmMessage: string;
	confirmButtonLabel: string;
	startOverButtonLabel: string;
	correctionInputPlaceholder: string;
	feedbackPrompt: string;
	feedbackPositiveAriaLabel: string;
	feedbackNegativeAriaLabel: string;
	feedbackThanksMessage: string;

	// ScorePhotoScan.svelte (inline per-player flow, used on the main matches page)
	photoScanFileInputLabel: string;
	photoScanScanningLabel: string;
	photoScanResultsHeading: string;
	photoScanCritLabel: string;
	photoScanKillLabel: string;
	photoScanTacLabel: string;
	photoScanApplyButtonLabel: string;

	// Shared between both flows
	rateLimitError: string;
	scanFailedError: string;
	unreadableImageError: string;
	canvasUnsupportedError: string;
	encodeFailedError: string;
	genericPhotoError: string;
	genericScanError: string;
};

// The LaunchDarkly JSON flag key that drives every user-facing string across
// the score-scan feature's two UI surfaces (ScoreChat.svelte and
// ScorePhotoScan.svelte) -- one flag, edited as JSON in the LD dashboard, so
// all of this feature's copy can change without a deploy.
export const SCORE_SCAN_COPY_FLAG_KEY = 'score-scan-copy';

export const DEFAULT_SCORE_SCAN_COPY: ScoreScanCopy = {
	chooseInputPrompt: 'How do you want to log your score?',
	fileInputLabel: 'Choose File / Take Photo',
	textInputPlaceholder: 'Type your score instead',
	sendButtonAriaLabel: 'Send',
	scanningLabel: 'Reading your score…',
	reviewTallyMessage: "Here's what I read: CRIT {{crit}}, KILL {{kill}}, TAC {{tac}}.",
	reviewTallyPrompt: 'Which op is your Primary?',
	primaryCritLabel: 'Crit',
	primaryKillLabel: 'Kill',
	primaryTacLabel: 'Tac',
	confirmMessage:
		'Your Primary score is {{primary}} (ceil({{primaryValue}} / 2)), for a total of {{total}}.',
	confirmButtonLabel: 'Confirm',
	startOverButtonLabel: 'Start over',
	correctionInputPlaceholder: "Say what's wrong, e.g. \"kill should be 3\"",
	feedbackPrompt: 'Did I get this right?',
	feedbackPositiveAriaLabel: 'Yes, this looks right',
	feedbackNegativeAriaLabel: 'No, this is wrong',
	feedbackThanksMessage: 'Thanks for the feedback!',

	photoScanFileInputLabel: 'Scan a scoreboard photo',
	photoScanScanningLabel: 'Scanning…',
	photoScanResultsHeading: 'Scanned values — review before applying.',
	photoScanCritLabel: 'Crit (0-6)',
	photoScanKillLabel: 'Kill (0-6)',
	photoScanTacLabel: 'Tac (0-6)',
	photoScanApplyButtonLabel: "Apply to {{groupName}}'s scores",

	rateLimitError: "You've hit today's scan limit — enter these scores manually.",
	scanFailedError: 'Scan failed ({{status}}).',
	unreadableImageError: "Couldn't read that image — try a PNG or JPEG screenshot instead.",
	canvasUnsupportedError: 'Canvas is not supported in this browser.',
	encodeFailedError: 'Could not encode the photo.',
	genericPhotoError: 'Could not read that photo.',
	genericScanError: 'Scan failed.'
};

// LD JSON flags return whatever's actually stored in the variation, so an
// editor saving a partial object (or a flag predating a new field) shouldn't
// blank out the rest of the UI -- merge over the defaults rather than
// trusting the flag value to be complete.
export function resolveScoreScanCopy(raw: Partial<ScoreScanCopy> | null | undefined): ScoreScanCopy {
	return { ...DEFAULT_SCORE_SCAN_COPY, ...raw };
}

// Minimal {{var}} substitution for the messages that embed scan results or
// other runtime values. These are plain LD JSON flag strings, not AI Config
// prompts, so there's no Mustache engine backing them -- this is just enough
// templating to cover it.
export function interpolate(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
		key in vars ? String(vars[key]) : match
	);
}
