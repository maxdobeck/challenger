import type { User, Session } from 'better-auth';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	// Injected by Vite `define` at build time (the deploy's git SHA, or 'dev').
	const __APP_VERSION__: string;

	// Injected by Vite `define` at build time: 'production' / 'preview' on
	// Vercel, 'ci' under GitHub Actions, otherwise 'development'. Reported to
	// LaunchDarkly Observability so test traffic is distinguishable from real
	// users, whose errors are the only ones with sourcemaps to unroll.
	const __APP_ENVIRONMENT__: string;

	namespace App {
		interface Locals { user?: User; session?: Session }

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
