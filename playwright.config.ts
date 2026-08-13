import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// The suite runs in whichever mode is configured:
//   - Real database: provide DATABASE_URL (a local .env, or CI's "database"
//     job) and the app runs against Postgres with real auth.
//   - Demo mode: with no DATABASE_URL, load .env.demo so the build + preview
//     servers and the test files run with DEMO_MODE=true and no database (CI's
//     "demo" job, and the default for a fresh checkout).
// Real-auth-only tests (login-as-max, smoketest-login) skip themselves when
// DEMO_MODE is set.
if (existsSync('.env')) {
	process.loadEnvFile('.env');
}
if (!process.env.DATABASE_URL && existsSync('.env.demo')) {
	process.loadEnvFile('.env.demo');
}

// `--headed` renders every worker as a full, GPU-composited browser window
// instead of a background process. 10 of those competing on a 10-core
// machine starves whichever window's turn is late, producing real
// (non-application) timeouts on effectively random tests. Even headless
// workers were flaky at 10 -- 5 is the current ceiling for both modes.
const HEADED = process.argv.includes('--headed');

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173, reuseExistingServer: !process.env.CI },
	testMatch: '**/*.e2e.{ts,js}',
	// Feature branches are checked out as nested worktrees under
	// .claude/worktrees/ (see CLAUDE.md workflow); without this, their e2e
	// files get swept up by the glob above and run against this checkout's
	// UI, failing on stale selectors from whatever state that branch was in.
	//
	// Anchored to this config's own directory rather than written as
	// '**/.claude/worktrees/**': Playwright matches testIgnore against absolute
	// paths, so the bare glob also matches a worktree's *own* tests when the
	// suite is run from inside one -- every spec is ignored and the run dies
	// with "No tests found". Anchoring means each checkout ignores only the
	// worktrees nested beneath it, which is the actual intent.
	testIgnore: `${import.meta.dirname}/.claude/worktrees/**`,
	globalSetup: './e2e/global-setup.ts',
	workers: HEADED ? 4 : 5,
	// 10 concurrent workers can outpace the single `npm run preview` process
	// (occasional ERR_CONNECTION_REFUSED under the burst of simultaneous
	// logins) -- retry on CI to absorb that without masking real failures
	// locally during dev.
	retries: process.env.CI ? 2 : 0
});
