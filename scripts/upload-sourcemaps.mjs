// Uploads client sourcemaps to LaunchDarkly Observability after the Vercel build.
// Runs from the `vercel-build` npm script. Self-skips (exit 0) whenever the
// required inputs are absent, so local builds and preview deploys never fail.
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const token = process.env.LD_ACCESS_TOKEN;
const version = process.env.VERCEL_GIT_COMMIT_SHA;
const vercelEnv = process.env.VERCEL_ENV;
const project = 'challenger';

function skip(reason) {
	console.log(`[sourcemaps] Skipping upload: ${reason}.`);
	process.exit(0);
}

if (!token) skip('LD_ACCESS_TOKEN not set');
if (!version) skip('VERCEL_GIT_COMMIT_SHA not set (not a Vercel git build)');
// Upload only for production deploys; flip/remove this to include previews.
if (vercelEnv && vercelEnv !== 'production') skip(`VERCEL_ENV=${vercelEnv}, not production`);

// adapter-vercel writes client assets (incl. hidden .map files) here; fall back
// to the raw Vite client output if the layout ever changes.
const path = ['.vercel/output/static', '.svelte-kit/output/client'].find((p) => existsSync(p));
if (!path) skip('no client build directory found');

console.log(`[sourcemaps] Uploading ${project} sourcemaps for ${version} from ${path} ...`);
execFileSync(
	'npx',
	[
		'-y',
		'@launchdarkly/ldcli@3.10.0',
		'sourcemaps',
		'upload',
		'--access-token',
		token,
		'--project',
		project,
		'--app-version',
		version,
		'--path',
		path
	],
	{ stdio: 'inherit' }
);
console.log('[sourcemaps] Upload complete.');
