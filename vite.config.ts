import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// Emit sourcemaps without a //# sourceMappingURL comment, so LaunchDarkly
	// Observability can de-minify production stack traces without serving the
	// maps to end users. Uploaded to LD from the `vercel-build` script.
	build: { sourcemap: 'hidden' },
	// Baked into the client bundle at build time. On Vercel this is the deploy's
	// git SHA (VERCEL_GIT_COMMIT_SHA), which must match the --app-version used
	// when uploading sourcemaps so LD can pair errors with the right maps.
	define: {
		__APP_VERSION__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev')
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
