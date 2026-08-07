# Challenger

A Kill Team tournament tracker — login, the full team list, player-vs-player match logging with Kill Team's VP scoring (crit/tac/kill/primary), per-team stats, and a leaderboard.

Built with SvelteKit, Drizzle ORM + Postgres, and better-auth.

## Quickstart

Once you've cloned the repo, installed dependencies, and set up `.env` (see below), start everything — database, migrations, seed data, and the dev server — with one command:

```sh
npm run launch
```

That's `db:up` (starts Postgres in the background via Docker) → `db:migrate` → `db:seed` → `dev`, chained together. It's safe to re-run any time; migrations and seeding are both idempotent.

## First-time setup

1. **Prerequisites**: Node.js, npm, and Docker (for local Postgres).
2. **Install dependencies**:
   ```sh
   npm install
   ```
3. **Configure environment**: copy `.env.example` to `.env` and fill in `BETTER_AUTH_SECRET` (any random string works for local dev, e.g. `openssl rand -hex 32`). The default `DATABASE_URL` and `ORIGIN` already match `compose.yaml` and the dev server port.
   ```sh
   cp .env.example .env
   ```
4. **Launch**:
   ```sh
   npm run launch
   ```
5. Open [http://localhost:5173](http://localhost:5173) and log in with one of the seeded accounts below.

> No Docker available? Run a local Postgres yourself (matching the `DATABASE_URL` in `.env`) and use `npm run db:migrate && npm run db:seed && npm run dev` instead of `db:up`.

### Demo logins

The seed script (`src/lib/server/db/seed.ts`) creates:

- A fixed account: `max@killteam.example` / `password123`
- 24 random players, all sharing the password `password123` — emails follow `firstname.lastname@killteam.example` (printed in full by the seed script's output)

## Everyday scripts

| Command | What it does |
| --- | --- |
| `npm run launch` | Start the database, run migrations, seed data, and start the dev server — all in one go |
| `npm run dev` | Start just the dev server (`-- --open` to open a browser tab) |
| `npm run db:up` | Start Postgres in the background (`docker compose up -d`) |
| `npm run db:start` | Start Postgres in the foreground, logs attached |
| `npm run db:migrate` | Apply pending Drizzle migrations |
| `npm run db:generate` | Generate a new migration from schema changes |
| `npm run db:studio` | Open Drizzle Studio to browse the database |
| `npm run db:seed` | Seed teams, demo users, and match history (idempotent) |
| `npm run auth:schema` | Regenerate the better-auth Drizzle schema after changing `src/lib/server/auth.ts` |
| `npm run check` | Type-check with `svelte-check` |
| `npm run lint` / `lint:fix` | Lint with ESLint (typescript-eslint + eslint-plugin-svelte) |
| `npm run test:e2e` | Run the Playwright end-to-end tests (builds and previews the app first) |
| `npm run build` | Build for production; preview with `npm run preview` |

> To deploy, you may need to swap in a different [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Deployment

**Known deploy warnings:** during `npm install` (e.g. on Vercel) npm prints two deprecation warnings:

```
npm warn deprecated @esbuild-kit/esm-loader@2.6.5: Merged into tsx: https://tsx.hirok.io
npm warn deprecated @esbuild-kit/core-utils@3.3.2: Merged into tsx: https://tsx.hirok.io
```

These are harmless and the build still succeeds. Both packages are transitive dependencies of `drizzle-kit` (a dev-only dependency used for `db:*` scripts), not something we depend on directly. They can't be removed until `drizzle-kit` drops the `@esbuild-kit/*` packages upstream — they've been merged into `tsx`, and the current latest `drizzle-kit` still references them.

## Project provenance

Originally scaffolded with [`sv`](https://github.com/sveltejs/cli):

```sh
npx sv@0.17.0 create --template minimal --types ts --add playwright better-auth="demo:password" ai-tools="ide:claude-code,vscode+delivery:plugin+tools:mcp,svelte-code-writer,svelte-core-bestpractices,svelte-file-editor+mcpSetup:remote" drizzle="database:postgresql+postgresql:postgres.js+docker:yes" --install npm challenger
```
