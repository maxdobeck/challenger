import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { resolveAppVersion, resolveEnvironment } from './scripts/app-version.mjs';

export default defineConfig({
	// Feature branches are checked out as nested worktrees under
	// .claude/worktrees/ (see CLAUDE.md workflow); without this, their *.test.ts
	// files get picked up by this checkout's run and fail on a .svelte-kit/
	// tsconfig that only exists once that worktree has been installed and synced.
	// playwright.config.ts carries the same exclusion for e2e.
	//
	// Relative rather than absolute (the opposite of playwright's testIgnore,
	// which matches absolute paths): vitest resolves these globs against the
	// project root, so this matches only the worktrees nested beneath whichever
	// checkout is running -- a worktree running its own suite is unaffected.
	test: { exclude: [...configDefaults.exclude, '.claude/worktrees/**'] },
	// Emit sourcemaps without a //# sourceMappingURL comment, so LaunchDarkly
	// Observability can de-minify production stack traces without serving the
	// maps to end users. Uploaded to LD from the `vercel-build` script.
	build: { sourcemap: 'hidden' },
	// Baked into the bundle at build time, and reported to LD Observability at
	// runtime by both the browser plugin ($lib/stores/launchdarkly) and the
	// server one ($lib/server/ai/ldClient).
	//
	// __APP_VERSION__ must match the --app-version that scripts/
	// upload-sourcemaps.mjs uploads under, or LD cannot pair an error with its
	// map — hence both read the same resolver rather than each deriving it.
	define: {
		__APP_VERSION__: JSON.stringify(resolveAppVersion()),
		__APP_ENVIRONMENT__: JSON.stringify(resolveEnvironment())
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter(),

			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
				}
			}
		})
	]
});
