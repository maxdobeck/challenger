import { describe, expect, it } from 'vitest';
import {
	EMAIL_PATTERN,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
	hasErrors,
	validateRegistration,
	type RegistrationInput
} from './registration';
import { DEMO_LOGIN_ACCOUNTS } from './server/db/demo-fixtures';

const VALID: RegistrationInput = {
	name: 'Max Dobeck',
	email: 'max@killteam.example',
	password: 'password123',
	confirmPassword: 'password123'
};

// Builds a submission that is valid except for the fields under test, so each
// assertion only ever fails for the reason it's about.
const submission = (overrides: Partial<RegistrationInput> = {}): RegistrationInput => ({
	...VALID,
	...overrides
});

const passwordOf = (length: number) => 'a'.repeat(length);

describe('validateRegistration', () => {
	it('accepts a well-formed submission', () => {
		expect(validateRegistration(VALID)).toEqual({});
	});

	it('reports every invalid field at once rather than stopping at the first', () => {
		const errors = validateRegistration({
			name: '',
			email: '',
			password: '',
			confirmPassword: ''
		});
		expect(Object.keys(errors).sort()).toEqual([
			'confirmPassword',
			'email',
			'name',
			'password'
		]);
	});
});

describe('validateRegistration: name', () => {
	it('rejects an empty name', () => {
		expect(validateRegistration(submission({ name: '' })).name).toBe('Enter your name.');
	});

	it('rejects a whitespace-only name', () => {
		expect(validateRegistration(submission({ name: '   ' })).name).toBe('Enter your name.');
	});

	it('accepts a name with surrounding whitespace', () => {
		expect(validateRegistration(submission({ name: '  Max Dobeck  ' })).name).toBeUndefined();
	});
});

describe('validateRegistration: email', () => {
	const INVALID_MESSAGE = 'Enter a valid email address, including a domain like example.com.';

	it('rejects an empty email', () => {
		expect(validateRegistration(submission({ email: '' })).email).toBe(
			'Enter your email address.'
		);
	});

	it.each(['not-an-email', 'challenger.example.com', 'max.challenger.example'])(
		'rejects %s for having no @ symbol',
		(email) => {
			expect(validateRegistration(submission({ email })).email).toBe(INVALID_MESSAGE);
		}
	);

	it.each([
		['max@killteam', 'no top-level domain at all'],
		['max@killteam.', 'a trailing dot with nothing after it'],
		['max@killteam.e', 'a single-letter top-level domain'],
		['max@killteam.123', 'a numeric top-level domain']
	])('rejects %s (%s)', (email) => {
		expect(validateRegistration(submission({ email })).email).toBe(INVALID_MESSAGE);
	});

	it.each([
		['max @killteam.example', 'a space in the local part'],
		['@killteam.example', 'no local part'],
		['max@', 'no domain'],
		['max@@killteam.example', 'two @ symbols']
	])('rejects %s (%s)', (email) => {
		expect(validateRegistration(submission({ email })).email).toBe(INVALID_MESSAGE);
	});

	it.each([
		['max@killteam.example', 'a plain domain'],
		['max@challenger.example.com', 'a subdomain'],
		['a@b.co', 'a two-letter top-level domain'],
		['max.dobeck+kt@killteam.example', 'a plus-addressed local part']
	])('accepts %s (%s)', (email) => {
		expect(validateRegistration(submission({ email })).email).toBeUndefined();
	});

	it('accepts an email with surrounding whitespace', () => {
		expect(
			validateRegistration(submission({ email: '  max@killteam.example  ' })).email
		).toBeUndefined();
	});

	// Tripwire: the seeded accounts are what every real-database e2e signs in as, so
	// a tightening of EMAIL_PATTERN that would lock them out must fail here first.
	it('accepts every seeded demo account email', () => {
		for (const account of DEMO_LOGIN_ACCOUNTS) {
			expect(EMAIL_PATTERN.test(account.email), account.email).toBe(true);
		}
	});
});

describe('validateRegistration: password', () => {
	it('rejects an empty password', () => {
		expect(
			validateRegistration(submission({ password: '', confirmPassword: '' })).password
		).toBe('Choose a password.');
	});

	it('rejects a password of exactly 8 characters', () => {
		const password = passwordOf(8);
		expect(validateRegistration(submission({ password, confirmPassword: password })).password).toBe(
			'Password must be more than 8 characters.'
		);
	});

	it('accepts a password of exactly 9 characters', () => {
		const password = passwordOf(MIN_PASSWORD_LENGTH);
		expect(
			validateRegistration(submission({ password, confirmPassword: password })).password
		).toBeUndefined();
	});

	it('accepts a password of exactly the maximum length', () => {
		const password = passwordOf(MAX_PASSWORD_LENGTH);
		expect(
			validateRegistration(submission({ password, confirmPassword: password })).password
		).toBeUndefined();
	});

	it('rejects a password one character over the maximum', () => {
		const password = passwordOf(MAX_PASSWORD_LENGTH + 1);
		expect(validateRegistration(submission({ password, confirmPassword: password })).password).toBe(
			'Password must be 128 characters or fewer.'
		);
	});

	it('does not trim passwords, so surrounding spaces count toward the length', () => {
		const password = `  ${passwordOf(7)}  `; // 11 characters, only 7 of them non-space
		expect(
			validateRegistration(submission({ password, confirmPassword: password })).password
		).toBeUndefined();
	});
});

describe('validateRegistration: confirmPassword', () => {
	it('rejects an empty confirmation', () => {
		expect(validateRegistration(submission({ confirmPassword: '' })).confirmPassword).toBe(
			'Re-enter your password.'
		);
	});

	it('rejects a confirmation that does not match', () => {
		expect(
			validateRegistration(submission({ confirmPassword: 'something-else' })).confirmPassword
		).toBe('Passwords do not match.');
	});

	it('accepts a matching confirmation', () => {
		expect(validateRegistration(VALID).confirmPassword).toBeUndefined();
	});

	it('asks for a password rather than reporting a mismatch when both are empty', () => {
		const errors = validateRegistration(submission({ password: '', confirmPassword: '' }));
		expect(errors.password).toBe('Choose a password.');
		expect(errors.confirmPassword).toBe('Re-enter your password.');
	});
});

describe('hasErrors', () => {
	it('is false for a valid result', () => {
		expect(hasErrors({})).toBe(false);
	});

	it('is true when any field failed', () => {
		expect(hasErrors({ name: 'Enter your name.' })).toBe(true);
	});
});

describe('password length constants', () => {
	// Pinned so a change to either is a deliberate edit, made alongside the copy in
	// the form and the messages above, rather than a silent drift.
	it('requires more than 8 characters', () => {
		expect(MIN_PASSWORD_LENGTH).toBe(9);
	});

	it('caps at better-auth’s default maximum', () => {
		expect(MAX_PASSWORD_LENGTH).toBe(128);
	});
});
