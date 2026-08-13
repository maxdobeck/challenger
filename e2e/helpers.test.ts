import { describe, expect, it } from 'vitest';
import { deleteE2eUsers, newE2eEmail } from './helpers';
import { DEMO_LOGIN_ACCOUNTS, STATIC_USER } from '../src/lib/server/db/demo-fixtures';

describe('newE2eEmail', () => {
	it('produces a fresh address every call', () => {
		expect(newE2eEmail()).not.toBe(newE2eEmail());
	});

	it('produces addresses the cleanup sweep will match', () => {
		expect(newE2eEmail()).toMatch(/^e2e-[0-9a-f-]+@challenger\.example\.com$/);
	});
});

describe('deleteE2eUsers', () => {
	// The guard runs before the database connection, so these need no DATABASE_URL.
	it('refuses to delete a seeded account', async () => {
		await expect(deleteE2eUsers([STATIC_USER.email])).rejects.toThrow(
			/refusing to delete non-e2e accounts/
		);
	});

	it('names every offending address so a mistake is obvious', async () => {
		await expect(
			deleteE2eUsers([newE2eEmail(), 'someone@example.com', STATIC_USER.email])
		).rejects.toThrow(`someone@example.com, ${STATIC_USER.email}`);
	});

	it('refuses even one seeded account hidden among generated ones', async () => {
		const accounts = DEMO_LOGIN_ACCOUNTS.map((a) => a.email);
		for (const seeded of accounts) {
			await expect(deleteE2eUsers([newE2eEmail(), seeded])).rejects.toThrow(
				/refusing to delete non-e2e accounts/
			);
		}
	});

	it('does nothing, and connects to nothing, for an empty list', async () => {
		await expect(deleteE2eUsers([])).resolves.toBeUndefined();
	});
});
