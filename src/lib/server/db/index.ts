import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

const DEMO_MODE = env.DEMO_MODE === 'true';

if (!DEMO_MODE && !env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// In demo mode there's no real database — every caller of `db` is expected to
// branch on DEMO_MODE and use the in-memory demo dataset instead
// (see $lib/server/demo/data.ts), so this placeholder is constructed but
// never actually queried.
export const db = DEMO_MODE
	? (undefined as unknown as ReturnType<typeof drizzle<typeof schema>>)
	: drizzle(postgres(env.DATABASE_URL), { schema });
