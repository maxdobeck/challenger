// Uploads client sourcemaps to LaunchDarkly Observability from the build that
// produces the DEPLOYED artifacts (Vercel's `vercel-build`). It must run from
// that build: the maps only match if they correspond to the exact
// content-hashed files that actually get served. A separate CI build (e.g. the
// GitHub Actions test workflow) produces different artifacts, so uploading from
// there would push maps for files no one is served — hence this lives here.
//
// Bulletproof by design:
//   * Downloads a pinned `ldcli` binary straight from GitHub releases. The npm
//     package `@launchdarkly/ldcli` has `bin: null` (it shells out to go-npm in
//     a postinstall), so `npx @launchdarkly/ldcli` fails with
//     "could not determine executable to run". We avoid npx entirely.
//   * Retries the download and the upload to ride out transient network errors.
//   * On a real deploy (Vercel production/preview) any failure is FATAL, so a
//     deploy can never silently ship without sourcemaps. Escape hatches:
//       - SOURCEMAPS_UPLOAD_OPTIONAL=true  -> downgrade failures to a warning
//       - SOURCEMAPS_UPLOAD_FORCE=true     -> run the upload outside a deploy
//         (e.g. a manual/local re-upload for a specific version)
//       - SOURCEMAPS_UPLOAD_DRY_RUN=true   -> resolve the version, find the
//         maps and print the exact ldcli invocation, without downloading
//         anything or uploading. Use it to confirm the version and paths line
//         up with what the bundle reports, without a real access token.
import { existsSync, readdirSync, statSync, mkdtempSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolveAppVersion } from './app-version.mjs';

const LDCLI_VERSION = '3.10.0';
const PROJECT = 'challenger';
const MAX_ATTEMPTS = 3;

const token = process.env.LD_ACCESS_TOKEN;
const vercelEnv = process.env.VERCEL_ENV;
const force = process.env.SOURCEMAPS_UPLOAD_FORCE === 'true';
const optional = process.env.SOURCEMAPS_UPLOAD_OPTIONAL === 'true';
const dryRun = process.env.SOURCEMAPS_UPLOAD_DRY_RUN === 'true';

// MUST equal the `version` baked into the bundle. Shared with vite.config.ts
// rather than re-derived here, because the two silently drifting apart is the
// one failure this whole script cannot detect: the upload succeeds, and the
// maps are simply filed under a key no error will ever look up.
const version = resolveAppVersion();

// A real deploy that must not ship without maps.
const isVercelDeploy = vercelEnv === 'production' || vercelEnv === 'preview';
// Whether we attempt the upload at all, and whether a failure is fatal.
const active = isVercelDeploy || force || dryRun;
// A dry run reports rather than ships, so nothing it finds should fail a build.
const fatal = active && !optional && !dryRun;

function skip(reason) {
	console.log(`[sourcemaps] Skipping upload: ${reason}.`);
	process.exit(0);
}

// Non-fatal contexts warn and exit 0; a real deploy fails the build so it never
// ships without sourcemaps.
function stop(reason) {
	if (fatal) {
		console.error(
			`[sourcemaps] ${reason} — failing the build so this deploy does not ship without sourcemaps ` +
				`(set SOURCEMAPS_UPLOAD_OPTIONAL=true to override).`
		);
		process.exit(1);
	}
	console.warn(`[sourcemaps] ${reason} — continuing (not a fatal context).`);
	process.exit(0);
}

function sleep(seconds) {
	// Synchronous, dependency-free backoff between retries.
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

function withRetry(label, attempt) {
	for (let i = 1; i <= MAX_ATTEMPTS; i++) {
		if (attempt(i)) return true;
		if (i < MAX_ATTEMPTS) {
			console.warn(`[sourcemaps] ${label} attempt ${i}/${MAX_ATTEMPTS} failed; retrying...`);
			sleep(i * 2);
		}
	}
	return false;
}

// --- guards -------------------------------------------------------------
// A non-prod/preview Vercel env (e.g. 'development') never deploys assets.
if (vercelEnv && !isVercelDeploy && !force && !dryRun) {
	skip(`VERCEL_ENV=${vercelEnv}, not production/preview`);
}
if (!active) skip('not a production/preview deploy (set SOURCEMAPS_UPLOAD_FORCE=true to run manually)');
// 'dev' is resolveAppVersion()'s last-resort fallback, reached only when there
// is no Vercel/GitHub sha and no git repo. Every build that ever reaches it
// shares the one key, so it is not a usable version to file maps under.
if (version === 'dev') stop('could not determine an app version (no VERCEL_GIT_COMMIT_SHA / GITHUB_SHA / git HEAD)');
// A dry run never contacts LaunchDarkly, so it needs no credentials.
if (!token && !dryRun) stop('LD_ACCESS_TOKEN not set — add it to this environment scope');

// --- locate maps --------------------------------------------------------
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

// adapter-vercel writes the served client assets (with their hidden .map files)
// to .vercel/output/static; a plain Vite build writes them to
// .svelte-kit/output/client. Pick whichever actually contains sourcemaps.
const candidates = ['.vercel/output/static', '.svelte-kit/output/client'];
const mapsPath = candidates.find((c) => existsSync(c) && countMaps(c) > 0);
if (!mapsPath) stop(`no .map files found in ${candidates.join(' or ')}`);

// --- dry run ------------------------------------------------------------
// Everything above is the part that can silently be wrong (which version, which
// directory); everything below is just network. Report and stop, so the
// interesting half can be checked without a token or a deploy.
if (dryRun) {
	console.log(`[sourcemaps] Dry run — nothing will be downloaded or uploaded.`);
	console.log(`[sourcemaps]   app-version: ${version}`);
	console.log(`[sourcemaps]   path:        ${mapsPath} (${countMaps(mapsPath)} map(s))`);
	console.log(`[sourcemaps]   project:     ${PROJECT}`);
	console.log(`[sourcemaps]   token:       ${token ? 'set' : 'NOT set (required for a real upload)'}`);
	process.exit(0);
}

// --- fetch the pinned ldcli binary --------------------------------------
function ldcliAsset() {
	const osName = { linux: 'linux', darwin: 'darwin', win32: 'windows' }[process.platform];
	const arch = { x64: 'amd64', arm64: 'arm64', ia32: '386' }[process.arch];
	if (!osName || !arch) stop(`unsupported platform ${process.platform}/${process.arch} for ldcli`);
	return `ldcli_${LDCLI_VERSION}_${osName}_${arch}.tar.gz`;
}

const workdir = mkdtempSync(join(tmpdir(), 'ldcli-'));
const asset = ldcliAsset();
const url = `https://github.com/launchdarkly/ldcli/releases/download/v${LDCLI_VERSION}/${asset}`;
const tarball = join(workdir, asset);
const ldcli = join(workdir, process.platform === 'win32' ? 'ldcli.exe' : 'ldcli');

console.log(`[sourcemaps] Fetching ldcli ${LDCLI_VERSION} (${asset}) ...`);
const downloaded = withRetry('download', () => {
	const dl = spawnSync(
		'curl',
		['-fsSL', '--retry', '3', '--retry-delay', '2', '-o', tarball, url],
		{ encoding: 'utf8' }
	);
	if (dl.status !== 0) {
		if (dl.stderr) console.warn(dl.stderr.trim());
		return false;
	}
	const ex = spawnSync('tar', ['-xzf', tarball, '-C', workdir], { encoding: 'utf8' });
	if (ex.status !== 0) {
		if (ex.stderr) console.warn(ex.stderr.trim());
		return false;
	}
	return existsSync(ldcli);
});
if (!downloaded) stop(`failed to download/extract ldcli from ${url}`);
chmodSync(ldcli, 0o755);

// --- upload -------------------------------------------------------------
console.log(
	`[sourcemaps] Uploading ${countMaps(mapsPath)} map(s) from ${mapsPath} for app-version ${version} ...`
);
const uploaded = withRetry('upload', () => {
	const r = spawnSync(
		ldcli,
		[
			'--access-token',
			token,
			'sourcemaps',
			'upload',
			'--project',
			PROJECT,
			'--app-version',
			version,
			'--path',
			mapsPath
		],
		{ encoding: 'utf8' }
	);
	if (r.stdout) console.log(r.stdout.trim());
	if (r.stderr) console.log(r.stderr.trim());
	return r.status === 0;
});
if (!uploaded) stop(`upload failed after ${MAX_ATTEMPTS} attempts`);

console.log('[sourcemaps] Upload complete.');
