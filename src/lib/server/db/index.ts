import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

const DEMO_MODE = env.DEMO_MODE === 'true';

function createDb() {
	// In demo mode there's no real database — every caller of `db` is expected to
	// branch on DEMO_MODE and use the in-memory demo dataset instead
	// (see $lib/server/demo/data.ts), so this placeholder is constructed but
	// never actually queried.
	if (DEMO_MODE) {
		return undefined as unknown as ReturnType<typeof drizzle<typeof schema>>;
	}

	// Checked here rather than at the top level so it narrows to `string` for
	// postgres() — TypeScript can't tell that an earlier `!DEMO_MODE && !url`
	// guard has already run by the time this branch is reached.
	const url = env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is not set');

	return drizzle(postgres(url), { schema });
}

export const db = createDb();
