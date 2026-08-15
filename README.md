# Challenger

A Kill Team tournament tracker — login, the full team list, player-vs-player match logging with Kill Team's VP scoring (crit/tac/kill/primary), per-team stats, tournaments, and a leaderboard. 

## Ways to run Challenger

In increasing order of effort:

| # | Way | What you run | Data | Setup |
| --- | --- | --- | --- | --- |
| 1 | [Publicly Available Demo Site](#1-hosted-demo) | <https://challenger-phi.vercel.app/> | In-memory (per serverless instance) | None |
| 2 | [Demo mode, locally](#2-demo-mode-locally) | `npm run dev:demo` | In-memory (per server process) | `npm install` |
| 3 | [Full local stack](#3-full-local-stack) | `npm run launch` | Postgres via Docker, build, database seed, etc | `.env` + Docker |

Every mode runs the same UI. What changes is where the data lives and how auth works. 

---

## 1. Hosted demo

Follow this link to the Demo Site: **<https://challenger-phi.vercel.app/>**

It's a demo-mode build: [`vercel.json`](vercel.json) sets `DEMO_MODE=true` at build and runtime, so there's no database and no `DATABASE_URL`. Log in from the account dropdown on `/login` — the curated roster in [`demo-fixtures.ts`](src/lib/server/db/demo-fixtures.ts) (Max, test1, testTourney, then 12 tournament players and the casual-only cohort).

Some things behave differently from a local run with a database:

- Everything is temporary. Data is ephemeral and often stored in memory or in cookies. When you logout or close the tab the data is gone. Purely a demo website. 
- Client-side LaunchDarkly is live either way: `PUBLIC_LD_CLIENT_ID` points at the `challenger` production LD environment, so the hosted demo emits real flag evaluations, experiment exposures, and session replays.

## 2. Demo mode, locally

```sh
npm install
npm run dev:demo
```

No Docker, no Postgres, no `.env` file. `vite dev --mode demo` loads [`.env.demo`](.env.demo) (`DEMO_MODE=true`) and the app runs against an in-memory dataset built by [`src/lib/server/demo/data.ts`](src/lib/server/demo/data.ts) — the same team list, players, tournaments and match-generation logic as the real seed script(database mode), from a fixed seed so every start produces an identical dataset.

Open <http://localhost:5173> and log in on `/login`:

- **The demo-account dropdown** signs you in as any curated account with one click. You should be able to sign out and login as other accounts (different flags apply)
- **The email/password form** accepts *any* account in the in-memory dataset (all of `FAKE_PLAYERS` and `CASUAL_PLAYERS`, not just the curated subset) — in demo mode the password isn't checked for those, since there's no database to check it against. Accounts you create through `/register` are real in-memory identities and *do* get their password verified.

Logged matches survive until you stop the server. Restart and you're back to the baseline dataset.

The masthead reads **"Challenger: DEMO_MODE"** so you always know which mode you're in.

## 3. Full local stack

The real thing: Postgres, better-auth(a package), persistent data.

1. **Prerequisites**: Node.js 22+, npm, and Docker (for local Postgres database).
2. **Install dependencies**:
   ```sh
   npm install
   npm run build
   ```
3. **Configure environment**: copy `.env.example` to `.env` and fill in `BETTER_AUTH_SECRET` (any random string for local dev, e.g. `openssl rand -hex 32`). The default `DATABASE_URL` already matches [`compose.yaml`](compose.yaml). Everything else in the file is optional — see [Environment variables](#environment-variables).
   ```sh
   cp .env.example .env
   ```
   There are five environemnt variables to obtain:
   - `DATABASE_URL="postgres://root:mysecretpassword@localhost:5432/local"`: This one is hardcoded, should copy-paste this as-is.

   - `BETTER_AUTH_SECRET`:  Generate in [the steps here](https://better-auth.com/docs/installation) or with `openssl rand -base64 32`

   - `PUBLIC_LD_CLIENT_ID`: From your Launch Darkly project. OK to hardcode as its public.

   - `LAUNCHDARKLY_SDK_KEY`: Also [from your project](https://launchdarkly.com/docs/home/account/environment/keys#create-sdk-credentials), this one is secret!

   - `ANTHROPIC_API_KEY`: [optional]For your API calls to examine images or put in the score with AI assistance.

4. **Launch**:
   ```sh
   npm run launch
   ```
   That's `db:up` (Postgres in the background via Docker) → `db:migrate` → `db:seed` → `dev`, chained. Safe to re-run any time; migrations and seeding are both idempotent.
5. Open <http://localhost:5173> and log in with a seeded account.

> No Docker? Run a Postgres yourself matching the `DATABASE_URL` in `.env`, then `npm run db:migrate && npm run db:seed && npm run dev`.

### Seeded logins

[`src/lib/server/db/seed.ts`](src/lib/server/db/seed.ts) creates, all sharing the password `password123`:

| Account | Email | Why it exists |
| --- | --- | --- |
| Max | `max@killteam.example` | Fixed account with a known match history |
| test1 | `test1@challenger.example.com` | Spare fixed account for manual testing |
| testTourney | `testTourney@challenger.example.com` | Forced tournament history, so `hasPlayedTournament` is always true |
| 48 tournament players | `firstname.lastname@killteam.example` | Populate the leaderboard, tournaments and stats |
| 20 casual players | `firstname.lastname@killteam.example` | Never attend tournaments — the cohort the `social-matchmake-cta` experiment targets |

The seed script prints every address it creates.

## 4. Production build locally

```sh
npm run build
npm run preview
```

Serves the built app on <http://localhost:4173> — the exact configuration the Playwright suite drives. Note that `preview` loads `.env`, not `.env.demo`: to preview demo mode, either set `DEMO_MODE=true` in `.env` or run the tests, whose config loads the env files explicitly (see [Tests](#tests)).

---

## Environment variables

Every one of these is optional except where a mode requires it — the app degrades to a working state rather than failing to boot.

| Variable | Needed for | Without it |
| --- | --- | --- |
| `DATABASE_URL` | Modes 3 & 4 | The app can't start unless `DEMO_MODE=true` |
| `BETTER_AUTH_SECRET` | Real auth | Sessions can't be signed |
| `ORIGIN` | Deployed real-auth setups | Fine to leave empty locally |
| `DEMO_MODE=true` | Demo mode | Falls through to database + better-auth |
| `PUBLIC_LD_CLIENT_ID` | Pointing at a different LD environment | Falls back to the committed production client-side ID (client-side IDs aren't secret), so flags still evaluate on a fresh checkout |
| `LAUNCHDARKLY_SDK_KEY` | Server-side AI Config resolution, generation metrics, judges, traces | The server SDK never initializes, tracker calls no-op, and an AI Config's Monitoring tab stays empty however much the feature is used |
| `ANTHROPIC_API_KEY` | Real score scanning | Scans return randomized placeholder scores |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Persisting demo-mode writes across serverless instances | Demo writes stay in per-process memory |
| `LD_ACCESS_TOKEN` | Uploading sourcemaps at deploy time | Production stack traces in LD stay minified |

## LD Features of note
- Flags by segment
- Flags by hardcoded user context
- AI judges and observation(AI Config)
- Telemetry: sourcemap uploads for when errors happen
- An experiment to see if a call-to-action is working
- Telemetry: some metrics, frustration clicks

## AI features

Score scanning is backed by three completion-mode LaunchDarkly AI Configs, each resolved at request time (model and system prompt both come from LD, with in-code defaults as the fallback):

| AI Config key | Feature |
| --- | --- |
| `score-photo-scan` | Read crit/kill/tac off a photo of a turning-point tracker |
| `score-text-parse` | Parse a typed score description |
| `score-chat` | Multi-turn chat that fills in the match form |

Each call runs inside an OpenTelemetry span carrying `launchdarkly.ai.config.key` and the `gen_ai.*` attributes LD needs to treat it as an LLM trace, so generations show up in the AI Config's Monitoring tab alongside judge results. Uploads are downscaled client-side to Anthropic's recommended 1568px long edge before they're sent.

## LaunchDarkly configuration

Everything the app evaluates lives in the `challenger` project, environments `production`
and `test`. [`docs/launchdarkly-setup.md`](docs/launchdarkly-setup.md) is the from-scratch
recipe for recreating it — targeting rules, prompts, and models, all read back out of the
live project — and it opens with a compact spec block an agent with the LaunchDarkly MCP
server can build from directly.

| Type | Keys |
| --- | --- |
| Flags | `tourneys-in-area`, `social-matchmake`, `debug-mode` |
| Segments | `non-tournament-players`, `debug` |
| Experiments | `social-matchmake-cta` |
| Metrics | `matchmake-click-rate` (plus autogenerated `ld_autogen__*` telemetry metrics) |
| AI Configs | `score-chat` (agent), `score-photo-scan`, `score-text-parse` (completion) |
| Judges | `score-read-judge` (custom); `accuracy`, `relevance`, `toxicity` (stock) |

## Tests

| Command | What it covers |
| --- | --- |
| `npm run test:unit` | Vitest — pure logic (scoring, team stats, registration). No browser or DB |
| `npm run test:e2e` | Playwright, excluding the `@traffic` and `@ai` tags |
| `npm run test:e2e:traffic` | Bulk traffic generator — logs 25 accounts in and out to feed LD experiments |
| `npm run test:e2e:ai` | The unmocked AI tests — needs a real `ANTHROPIC_API_KEY` |
| `npm test` | Unit then e2e |

The e2e suite runs in whichever mode is configured, and [`playwright.config.ts`](playwright.config.ts) decides by looking at `DATABASE_URL`: set (from your `.env`) means the real database with real auth; unset means it loads `.env.demo` and everything runs in demo mode. Real-auth-only tests skip themselves in demo mode. Either way it builds the app and serves it on port 4173 first.

[CI](.github/workflows/playwright.yml) runs all three jobs on every push and PR to `main`: `unit`, `demo` (no database), and `database` (Postgres service + seed).

## Everyday scripts

| Command | What it does |
| --- | --- |
| `npm run launch` | Database, migrations, seed, and dev server — all in one go |
| `npm run dev` | Just the dev server (`-- --open` to open a browser tab) |
| `npm run dev:demo` | Dev server in [demo mode](#2-demo-mode-locally) — no database |
| `npm run build` / `preview` | Production build; preview it on port 4173 |
| `npm run db:up` | Start Postgres in the background (`docker compose up -d`) |
| `npm run db:start` | Start Postgres in the foreground, logs attached |
| `npm run db:migrate` | Apply pending Drizzle migrations |
| `npm run db:generate` | Generate a new migration from schema changes |
| `npm run db:push` | Push schema straight to the database, no migration file |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run db:seed` | Seed teams, demo users, and match history (idempotent) |
| `npm run auth:schema` | Regenerate the better-auth Drizzle schema after changing `src/lib/server/auth.ts` |
| `npm run check` | Type-check with `svelte-check` |
| `npm run lint` / `lint:fix` | ESLint (typescript-eslint + eslint-plugin-svelte) |

## Project provenance

Originally scaffolded with [`sv`](https://github.com/sveltejs/cli):

```sh
npx sv@0.17.0 create --template minimal --types ts --add playwright better-auth="demo:password" ai-tools="ide:claude-code,vscode+delivery:plugin+tools:mcp,svelte-code-writer,svelte-core-bestpractices,svelte-file-editor+mcpSetup:remote" drizzle="database:postgresql+postgresql:postgres.js+docker:yes" --install npm challenger
```
