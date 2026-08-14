## Project Configuration

- **Language**: TypeScript
- **Package Manager**: npm
- **Add-ons**: playwright, better-auth, ai-tools, drizzle

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

---

## Running tests

**End-to-end: run `npm run test:e2e`, and nothing else.**

Do not invoke `npx playwright test` directly, do not pass your own `--config`,
and do not override `--grep` / `--grep-invert`. The npm script is the only
supported entry point, because it carries `--grep-invert "@traffic|@ai"` — and
both of those tags cost real money or pollute real data:

- `@ai` (`e2e/ai/*`) makes live Anthropic API calls. Every run bills the
  account.
- `@traffic` (`e2e/traffic/*`) drives bulk traffic — `matchmake-random-users`
  alone creates 25 accounts and fires real flag evaluations and experiment
  exposures at the **production** LaunchDarkly environment. That is analytics
  data you cannot take back out.

Bypassing the config also loses `playwright.config.ts`'s `testIgnore` for
nested worktrees under `.claude/worktrees/`, which otherwise sweeps a feature
branch's specs into this checkout's run.

Run `npm run test:e2e:ai` or `npm run test:e2e:traffic` **only when the user
explicitly asks for that specific suite.** Never as part of a general "run the
tests".

**Unit tests: `npm run test:unit` is unrestricted.** It is vitest over pure
logic — no browser, no database, no network, no spend. Run it freely.

`npm run test` (unit + e2e) and `npm run check` / `npm run lint` are also
always safe.
