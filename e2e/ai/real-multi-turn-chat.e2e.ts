import { expect, test } from '@playwright/test';
import { deleteE2eUsers, loginAsFreshUser } from '../helpers';

// The other Quick Upload tests each drive a single turn, so nothing exercises
// the part of runScoreChatTurn that has to hand back a history the *next* turn
// can resend: the assistant turn carrying an unanswered tool call, plus the
// synthetic tool result that answers it. A malformed pair is accepted locally
// and only rejected when it reaches the model, which is exactly the failure a
// one-turn test cannot see.
//
// Tagged @ai and excluded from the default suite (grep-invert "@traffic|@ai")
// because it makes two billable model calls. Run with `npm run test:e2e:ai`.
test.describe('a multi-turn score conversation', { tag: '@ai' }, () => {
	const createdEmails: string[] = [];
	test.afterEach(async () => {
		await deleteE2eUsers(createdEmails.splice(0));
	});

	test('the history from one turn is accepted as the input to the next', async ({ page }) => {
		test.setTimeout(150_000);

		const email = await loginAsFreshUser(page);
		if (email) createdEmails.push(email);
		await page.goto('/matches/quick-upload');
		await page.waitForLoadState('networkidle');

		// SvelteKit rejects a cross-site form POST, and a bare request.post has no
		// Origin -- send the page's own so this reads as same-site.
		const origin = new URL(page.url()).origin;
		const send = async (text: string, history: unknown[]) => {
			const response = await page.request.post('/matches/scan/chat', {
				headers: { origin },
				multipart: { text, history: JSON.stringify(history) }
			});
			expect(response.status(), await response.text()).toBe(200);
			return response.json();
		};

		const first = await send('I got 4 crit, 2 kill, 5 tac.', []);
		expect(first.reply).toBeTruthy();
		expect(first.history.length).toBeGreaterThan(0);

		// Resending turn one's history unchanged is the client's contract, so a
		// 200 here is the proof: the model accepted the tool call/result pair we
		// built, rather than rejecting the conversation as malformed.
		const second = await send('My opponent got 3 crit, 1 kill, 2 tac.', first.history);
		expect(second.reply).toBeTruthy();
		expect(second.history.length).toBeGreaterThan(first.history.length);
	});
});
