import { expect, test } from '@playwright/test';
import { deleteE2eUsers, loginAsFreshUser } from '../helpers';

// The other Quick Upload tests each drive a single turn, so nothing exercises
// the part of runScoreChatTurn that has to hand back a history the *next* turn
// can resend: the assistant turn carrying an unanswered tool call, plus the
// synthetic tool result that answers it. A malformed pair is accepted locally
// and only rejected when it reaches the model, which is exactly the failure a
// one-turn test cannot see.
//
// It runs the conversation to completion rather than stopping at two turns, so
// it also reaches the state the thumbs-up is gated on -- see the feedback
// assertions at the end.
//
// Tagged @ai and excluded from the default suite (grep-invert "@traffic|@ai")
// because it makes three billable model calls. Run with `npm run test:e2e:ai`.
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

		// Naming both Primary ops is what completes a conversation: the model is
		// told never to infer primaryOpChoice from a photo, so it stays
		// outstanding until the player says it, and until both sides carry one
		// the UI keeps the thumbs-up hidden behind `bothSidesReady`.
		// Restates both sides in full rather than naming only the ops: a turn that
		// mentions Primary alone leaves the model re-deriving the numbers from
		// history, and it answers by asking again instead of committing a reading.
		const third = await send(
			'To confirm: I scored 4 crit, 2 kill, 5 tac and my Primary op is Crit. My opponent ' +
				'scored 3 crit, 1 kill, 2 tac and their Primary op is Kill.',
			second.history
		);
		expect(third.reply).toBeTruthy();
		// Deliberately not asserting that both sides came back complete. Whether
		// the model commits a reading on a given turn or asks once more first is
		// model variance, not a regression -- an earlier version of this test
		// asserted it and failed about half the time. What the run does have to
		// produce either way is a token to attach feedback to.
		expect(third.resumption_token, 'no resumption token to attach feedback to').toBeTruthy();

		// The satisfied path, which nothing else covers: a thumbs-up is a separate
		// request correlated to the run by its resumption token, so it is the one
		// piece of the feature that can break without any turn failing. `recorded`
		// comes back true only when LaunchDarkly accepted the feedback event
		// against that run -- a missing or unusable token reports false rather
		// than erroring, so asserting on it is what makes this meaningful.
		const feedback = await page.request.post('/matches/scan/feedback', {
			headers: { origin },
			data: { resumption_token: third.resumption_token, kind: 'positive' }
		});
		expect(feedback.status(), await feedback.text()).toBe(200);
		expect(await feedback.json()).toMatchObject({ ok: true, recorded: true });
	});
});
