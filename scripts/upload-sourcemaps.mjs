// Uploads client sourcemaps to LaunchDarkly Observability after the Vercel build.
// Runs from the `vercel-build` npm script. Self-skips (exit 0) whenever the
// required inputs are absent, and never fails the deploy: a sourcemap-upload
// problem is logged as a warning, not a build error.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const token = process.env.LD_ACCESS_TOKEN;
const version = process.env.VERCEL_GIT_COMMIT_SHA;
const vercelEnv = process.env.VERCEL_ENV;
const project = 'challenger';

function skip(reason) {
	console.log(`[sourcemaps] Skipping upload: ${reason}.`);
	process.exit(0);
}

// Loud, non-fatal skip for the case that SHOULD upload but can't: a real
// production/preview deploy missing its token. Uncaught in build logs, this is
// exactly how a deploy ships with no maps and its errors never de-minify.
function skipLoud(reason) {
	console.warn(
		`[sourcemaps] WARNING — not uploading on a deploy that should have maps: ${reason}. ` +
			`Stack traces for app-version ${version} will NOT de-minify in LaunchDarkly. ` +
			`Continuing so the deploy still succeeds.`
	);
	process.exit(0);
}

// Ordered so a genuine misconfiguration is loud: first rule out the non-deploy
// contexts (local build, non-prod/preview env) with quiet skips, so that a
// missing token past this point can only mean a real deploy lacks it.
if (!version) skip('VERCEL_GIT_COMMIT_SHA not set (not a Vercel git build)');
// Upload for production and preview deploys, so preview URLs de-minify too.
// Requires LD_ACCESS_TOKEN to be present in the Preview env scope on Vercel.
const uploadEnvs = ['production', 'preview'];
if (vercelEnv && !uploadEnvs.includes(vercelEnv)) skip(`VERCEL_ENV=${vercelEnv}, not ${uploadEnvs.join('/')}`);
if (!token) skipLoud('LD_ACCESS_TOKEN not set — add it to this environment scope in Vercel');

function countMaps(dir) {
	let total = 0;
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return 0;
	}
	for (const entry of entries) {
		const p = join(dir, entry);
		let s;
		try {
			s = statSync(p);
		} catch {
			continue;
		}
		if (s.isDirectory()) total += countMaps(p);
		else if (entry.endsWith('.map')) total += 1;
	}
	return total;
}

// adapter-vercel writes client assets to .vercel/output/static; Vite always
// writes the raw client output (with the hidden .map files) to
// .svelte-kit/output/client. Pick whichever actually contains sourcemaps.
const candidates = ['.vercel/output/static', '.svelte-kit/output/client'];
const path = candidates.find((c) => existsSync(c) && countMaps(c) > 0);
if (!path) skip(`no .map files found in ${candidates.join(' or ')}`);

console.log(
	`[sourcemaps] Uploading ${countMaps(path)} map(s) from ${path} for app-version ${version} ...`
);
const result = spawnSync(
	'npx',
	[
		'-y',
		'@launchdarkly/ldcli@3.10.0',
		'--access-token',
		token,
		'sourcemaps',
		'upload',
		'--project',
		project,
		'--app-version',
		version,
		'--path',
		path
	],
	{ encoding: 'utf8' }
);

if (result.stdout) console.log(result.stdout.trim());
if (result.stderr) console.log(result.stderr.trim());

if (result.status !== 0) {
	console.warn(
		`[sourcemaps] Upload failed (exit ${result.status ?? 'null'}); continuing so the deploy still succeeds.`
	);
	process.exit(0);
}
console.log('[sourcemaps] Upload complete.');
