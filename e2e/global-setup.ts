import { sweepE2eUsers } from './helpers';

// Runs once in the root process before any worker spawns. Workers re-import
// test files independently (once to list tests, again per-worker to run
// them), so anything that picks a *random* subset of dynamically generated
// tests (see matchmake-random-users.e2e.ts) needs a seed fixed here and
// inherited via env -- otherwise each import samples differently and
// Playwright fails with "Test not found in the worker process".
export default async function globalSetup() {
	process.env.MATCHMAKE_SEED = String(Math.floor(Math.random() * 2 ** 31));

	// register.e2e.ts deletes the accounts it creates in an afterEach, but that
	// hook can't run if the run itself is killed -- Ctrl-C, a cancelled CI job.
	// Sweeping here rather than in a teardown means the next run repairs the last
	// one, so an interrupted run can't strand rows indefinitely.
	//
	// Skipped in demo mode, which has no database at all (DATABASE_URL unset,
	// see playwright.config.ts).
	if (!process.env.DATABASE_URL) return;
	const stranded = await sweepE2eUsers();
	if (stranded > 0) {
		console.log(`[global-setup] removed ${stranded} account(s) left by an interrupted run`);
	}
}
