import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { APIError } from 'better-auth/api';
import { env } from '$env/dynamic/private';
import {
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
	hasErrors,
	validateRegistration,
	type RegistrationErrors
} from '$lib/registration';
import { registerDemoUser } from '$lib/server/demo/data';
import { DEMO_SESSION_COOKIE } from '$lib/server/demo/session';

const DEMO_MODE = env.DEMO_MODE === 'true';

/** For failures that belong to the whole form rather than one field. */
const NO_FIELD_ERRORS: RegistrationErrors = {};

/**
 * Every failure returns this same shape. Keeping it uniform — rather than
 * omitting `errors` or `values` on the branches that don't set them — keeps the
 * generated ActionData a single object type instead of a union the page would
 * have to narrow field by field.
 */
type RegistrationFailure = {
	errors: RegistrationErrors;
	values: { name: string; email: string };
	message?: string;
};

export const load: PageServerLoad = (event) => {
	if (event.locals.user) {
		return redirect(302, '/leaderboard');
	}
	return {};
};

/**
 * Map a better-auth failure onto the field the user can actually fix, falling
 * back to a banner message for anything we don't recognize.
 *
 * The duplicate-email case is matched on two codes plus the message text because
 * the code name has moved around across better-auth releases.
 *
 * Note this confirms whether an account exists for a given email. `/login`'s
 * better-auth errors already leak the same thing, and telling someone "you
 * already have an account" is the difference between them logging in and giving
 * up, so it's a deliberate trade rather than an oversight.
 */
function errorsFromApiError(error: APIError): { errors: RegistrationErrors; message?: string } {
	const code = (error.body as { code?: string } | undefined)?.code ?? '';
	const message = error.message ?? '';

	if (
		code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' ||
		code === 'USER_ALREADY_EXISTS' ||
		/already exists/i.test(message)
	) {
		return { errors: { email: 'That email is already registered. Try logging in instead.' } };
	}
	if (code === 'PASSWORD_TOO_SHORT') {
		return {
			errors: { password: `Password must be more than ${MIN_PASSWORD_LENGTH - 1} characters.` }
		};
	}
	if (code === 'PASSWORD_TOO_LONG') {
		return {
			errors: { password: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.` }
		};
	}
	if (code === 'INVALID_EMAIL') {
		return { errors: { email: 'Enter a valid email address.' } };
	}
	return { errors: NO_FIELD_ERRORS, message: message || 'Registration failed' };
}

export const actions: Actions = {
	// Unlike every other action in this app, failures here come back as per-field
	// `errors` alongside the `values` to repopulate, rather than a single flat
	// `message` — showing each problem next to the input that caused it is the
	// point of having a dedicated registration page. `message` is kept for the
	// failures that can't be pinned to one field.
	default: async (event) => {
		const formData = await event.request.formData();
		const name = (formData.get('name')?.toString() ?? '').trim();
		const email = (formData.get('email')?.toString() ?? '').trim();
		const password = formData.get('password')?.toString() ?? '';
		const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';

		// Echoed back so a failed submission doesn't wipe the form. Never the passwords.
		const values = { name, email };

		const errors = validateRegistration({ name, email, password, confirmPassword });
		if (hasErrors(errors)) {
			const failure: RegistrationFailure = { errors, values };
			return fail(400, failure);
		}

		if (DEMO_MODE) {
			// Unlike the curated demo accounts, a registered account is a real,
			// individually deletable identity scoped to this server process — this
			// is what powers trying out account deletion in demo mode.
			const created = registerDemoUser({ name, email, password });
			if (!created) {
				const failure: RegistrationFailure = {
					errors: { email: 'That email is already registered. Try logging in instead.' },
					values
				};
				return fail(400, failure);
			}
			event.cookies.set(DEMO_SESSION_COOKIE, created.id, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax'
			});
			return redirect(302, '/leaderboard');
		}

		// Dynamic import: $lib/server/auth builds a database-backed better-auth
		// instance, and `db` is undefined in demo mode, so it must never be
		// evaluated at module load. See src/hooks.server.ts.
		const { auth } = await import('$lib/server/auth');
		try {
			// better-auth signs the new user in and the sveltekitCookies plugin writes
			// the session cookie onto this action's response, so the redirect below
			// lands them logged in. No user_profile row is created here on purpose:
			// getUserProfile() already falls back to the same defaults a fresh row
			// would hold, and /matches upserts one on the first logged match.
			await auth.api.signUpEmail({ body: { email, password, name } });
		} catch (error) {
			if (error instanceof APIError) {
				const mapped = errorsFromApiError(error);
				const failure: RegistrationFailure = {
					errors: mapped.errors,
					values,
					message: mapped.message
				};
				return fail(400, failure);
			}
			const failure: RegistrationFailure = {
				errors: NO_FIELD_ERRORS,
				values,
				message: 'Unexpected error'
			};
			return fail(500, failure);
		}

		// Outside the try/catch on purpose: redirect() works by throwing, so inside
		// it the catch would swallow the success and turn it into a 500.
		return redirect(302, '/leaderboard');
	}
};
