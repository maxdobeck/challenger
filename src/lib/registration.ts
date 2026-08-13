// Registration form validation, shared by /register's page component and its
// action so the message shown before submitting is character-for-character the
// one the server would have produced.
//
// Deliberately NOT under $lib/server: SvelteKit refuses to bundle that into
// client-side code, and the page imports these rules directly. $lib/imageDownscale.ts
// is the existing precedent for a pure module shared across the boundary.

/**
 * Passwords must be *more* than 8 characters, so 9 is the shortest we accept.
 * That's stricter than better-auth's own default minimum of 8, which means our
 * check always fires first and the two can never disagree.
 */
export const MIN_PASSWORD_LENGTH = 9;

/** better-auth's default maxPasswordLength — mirrored so we fail early with our own copy. */
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Local part, "@", a domain, then a dot and a top-level domain of at least two
 * letters. This is a shape check, not an existence check: the only real proof an
 * address works is sending mail to it, which this app doesn't do.
 *
 * It deliberately doesn't validate against the IANA TLD list — the seeded and
 * demo accounts use the reserved `.example` TLD (see $lib/server/db/demo-fixtures),
 * so an allowlist of real TLDs would reject our own fixtures.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

export type RegistrationField = 'name' | 'email' | 'password' | 'confirmPassword';

export type RegistrationInput = Record<RegistrationField, string>;

/** Field -> the single message to show under that field. An empty object means valid. */
export type RegistrationErrors = Partial<Record<RegistrationField, string>>;

/**
 * Check a registration submission. Returns one message per invalid field (first
 * failing rule wins) and an empty object when everything passes.
 *
 * Names and emails are trimmed before checking; passwords never are, since
 * leading and trailing spaces are legitimate password characters.
 */
export function validateRegistration(input: RegistrationInput): RegistrationErrors {
	const errors: RegistrationErrors = {};

	const name = input.name.trim();
	if (!name) {
		errors.name = 'Enter your name.';
	}

	const email = input.email.trim();
	if (!email) {
		errors.email = 'Enter your email address.';
	} else if (!EMAIL_PATTERN.test(email)) {
		errors.email = 'Enter a valid email address, including a domain like example.com.';
	}

	const { password, confirmPassword } = input;
	if (!password) {
		errors.password = 'Choose a password.';
	} else if (password.length < MIN_PASSWORD_LENGTH) {
		errors.password = `Password must be more than ${MIN_PASSWORD_LENGTH - 1} characters.`;
	} else if (password.length > MAX_PASSWORD_LENGTH) {
		errors.password = `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
	}

	if (!confirmPassword) {
		errors.confirmPassword = 'Re-enter your password.';
	} else if (password && confirmPassword !== password) {
		// Only worth saying once there's a password to match against — otherwise an
		// empty form shouts "Passwords do not match" on top of "Choose a password".
		errors.confirmPassword = 'Passwords do not match.';
	}

	return errors;
}

export function hasErrors(errors: RegistrationErrors): boolean {
	return Object.keys(errors).length > 0;
}
