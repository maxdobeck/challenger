import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default defineConfig(
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			// The app doesn't use SvelteKit's typed resolve() helper for links —
			// adopting it is a separate routing-convention change, out of scope here.
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: tseslint.parser
			}
		}
	},
	{
		ignores: [
			'.svelte-kit/',
			// Where adapter-vercel writes the built, minified bundle. Only
			// present after a build with VERCEL=1 (or a `vercel` CLI run), which
			// is exactly what you do to reproduce a deploy locally — and without
			// this, that build buries `npm run lint` in thousands of errors
			// about generated code.
			'.vercel/',
			'build/',
			'drizzle/',
			'node_modules/',
			'src/lib/server/db/auth.schema.ts'
		]
	}
);
