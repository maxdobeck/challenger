// Demo mode has no database, so "logged in" is just this cookie holding a
// known demo user's id (see demoAuthUsersById in ./data.ts) rather than a
// real better-auth session. Shared between hooks.server.ts (reads it) and
// the /login and /logout actions (write/clear it) so the name can't drift.
export const DEMO_SESSION_COOKIE = 'demo_uid';
