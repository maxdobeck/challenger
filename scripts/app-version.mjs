// The single source of truth for the two strings LaunchDarkly Observability
// uses to make sense of a stack trace: the app *version* and the *environment*
// it ran in.
//
// This file exists because those strings are produced in two different places
// that must agree exactly:
//   * vite.config.ts bakes them into the client bundle (`__APP_VERSION__` /
//     `__APP_ENVIRONMENT__`), and the browser reports the version with every
//     error it sends.
//   * scripts/upload-sourcemaps.mjs passes the version to `ldcli sourcemaps
//     upload --app-version`, which is the key LD stores the maps under.
// LD pairs an error with a sourcemap by looking up `{version}/{path}`. If the
// two sides disagree by even one character, every map is unreachable and the UI
// falls back to "This stack trace could be more informative if you upload
// sourcemaps" — with no hint that the maps are sitting right there under a
// different key. They previously did disagree off Vercel: the bundle said
// 'dev' while the upload script used the git HEAD sha.
import { spawnSync } from 'node:child_process';

/**
 * The deploy's version, in priority order: Vercel, GitHub Actions, local git
 * HEAD, then a literal fallback.
 *
 * Content hashes in the asset paths (`nodes/7.CZBl8OhO.js`) do the real
 * disambiguating, so maps from several builds can share one version key
 * without clobbering each other. The version only has to *match*.
 *
 * @returns {string}
 */
export function resolveAppVersion() {
	const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
	return (
		process.env.VERCEL_GIT_COMMIT_SHA ||
		process.env.GITHUB_SHA ||
		(head.status === 0 ? head.stdout.trim() : '') ||
		'dev'
	);
}

/**
 * Where this build runs, as reported to LaunchDarkly Observability.
 *
 * Worth setting deliberately: the browser plugin's `environment` defaults to
 * `'production'`, so a Playwright run in CI files its errors under Production
 * alongside real user traffic — indistinguishable in the UI except by a
 * version string. Naming CI 'ci' makes that traffic one filter away.
 *
 * @returns {string}
 */
export function resolveEnvironment() {
	if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV;
	if (process.env.GITHUB_ACTIONS === 'true') return 'ci';
	return 'development';
}
