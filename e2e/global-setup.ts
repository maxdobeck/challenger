// Runs once in the root process before any worker spawns. Workers re-import
// test files independently (once to list tests, again per-worker to run
// them), so anything that picks a *random* subset of dynamically generated
// tests (see matchmake-random-users.e2e.ts) needs a seed fixed here and
// inherited via env -- otherwise each import samples differently and
// Playwright fails with "Test not found in the worker process".
export default async function globalSetup() {
	process.env.MATCHMAKE_SEED = String(Math.floor(Math.random() * 2 ** 31));
}
