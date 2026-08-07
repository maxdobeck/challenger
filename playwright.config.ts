import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// E2E runs against the demo build: loading .env.demo into process.env sets
// DEMO_MODE=true (and the demo ORIGIN/secret) so the build + preview servers —
// and the test files — run with no database. This matches CI, where there is no
// .env or Postgres. Real-auth tests that need a seeded DB skip themselves when
// DEMO_MODE is set (see smoketest-login / login-as-max).
if (existsSync('.env.demo')) {
	process.loadEnvFile('.env.demo');
}

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	testMatch: '**/*.e2e.{ts,js}'
});
