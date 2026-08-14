import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { resolveAppVersion, resolveEnvironment } from './scripts/app-version.mjs';

export default defineConfig({
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
