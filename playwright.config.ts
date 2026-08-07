import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Load .env so DATABASE_URL etc. are available to the config's webServer and to test files.
if (existsSync('.env')) {
	process.loadEnvFile('.env');
}

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	testMatch: '**/*.e2e.{ts,js}'
});
