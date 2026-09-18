# JLPT N5 Learning App

A small, mostly client-side app for JLPT N5 exam prep — hiragana reference charts, flashcards, and a writing exercise, plus a vocabulary reference and flashcard deck covering core N5 words (with kanji). Built with Vue 3 + Vite, styled with Tailwind CSS, and ships as a static `index.html` with a small Cloudflare Pages Functions backend for spaced-repetition review tracking.

## Features

- **Hiragana reference charts** — the base hiragana table (a/k/s/t/n/h/m/y/r/w), the dakuten/handakuten table (voiced and semi-voiced sounds), and the combinations (yōon) table, every cell showing the character and its romanized reading.
- **Hiragana flashcards** — pick a scope (a single row, a table group, or all characters) and step through a shuffled deck, revealing each answer on demand.
- **Writing exercises** — given a word in romaji (e.g. "sushi"), spell it by clicking the correct hiragana out of a shuffled grid that includes distractor characters.
- **Katakana reference charts and flashcards** — the same base/dakuten/combinations tables and scoped flashcard sessions as hiragana, over the katakana syllabary.
- **Vocabulary reference** — core N5 words grouped by theme (greetings, numbers, family, food, time, verbs, adjectives, ...), each showing kanji, kana, and English meaning.
- **Vocabulary flashcards** — pick one or more categories and step through a shuffled deck; each card shows the word in kanji + kana and you guess the meaning before revealing it.
- **Pronunciation playback** — a speaker button on every vocab word (reference and flashcards) and a free-text "Text to Speech" page (`#/speak`) read Japanese aloud via the browser's built-in Web Speech API, preferring macOS's Kyoko voice when available.
- **Listening quiz** (`#/listening-quiz`) — hear a native pronunciation recording of a word you've studied on WaniKani and type its English meaning. Its word cache is refreshed on demand via an in-app "Sync from WaniKani" button (see below), filtered to a minimum SRS stage; nothing runs automatically, so it's always your own account, your own pace.
- **Spaced-repetition review** — grading a flashcard (again/hard/good/easy) for signed-in users schedules its next review via a Cloudflare D1-backed API, shared across the hiragana and vocabulary decks.
- **Dark mode** — toggle in the header; respects your system preference on first visit and remembers your choice.
- **Routing** — each section has its own URL (including a picked flashcard scope, e.g. `#/flashcards/s`, `#/katakana-flashcards/s`, or `#/vocab-flashcards/food`), so the browser back/forward buttons work as expected.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL in a browser.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the local dev server with hot reload |
| `npm run build` | Build the static production bundle into `dist/` |
| `npm run preview` | Serve the built `dist/` bundle locally |
| `npm run test` | Run the unit test suite (Vitest) |
| `npm run test:e2e` | Run the end-to-end suite (Playwright) — local only, see below |
| `npm run sync:wanikani` | Refresh *local* D1's WaniKani word cache, for development (see below) |
| `npm run dev:api` | Build and serve the full app (frontend + Functions + local D1/R2) via `wrangler pages dev` |
| `npm run dev:workflow` | Run the `workflows/anki-import` Worker locally, needed alongside `dev:api` for Anki deck media import to work (see below) |

## E2E tests

`tests/e2e/` holds [Playwright](https://playwright.dev/) tests that drive the app in a real browser (dev server + Chromium), as opposed to Vitest's component-level unit tests.

**Local only, intentionally not run in CI.** `npm test` — the only test command CI's `deploy.yml` runs — is Vitest alone; `npm run test:e2e` is a separate script CI never calls. `playwright.config.js` also throws immediately if `CI` is set, as a second guard in case that ever changes by accident.

The suite reuses the Chromium build already managed by the [`playwright-cli`](https://formulae.brew.sh/formula/playwright-cli) Homebrew formula (`brew install playwright-cli`) instead of having `@playwright/test` download and manage its own copy — avoids a second multi-hundred-MB browser binary on disk. `playwright.config.js` looks up whatever `chromium-<rev>` build is already cached under `~/Library/Caches/ms-playwright` and launches that directly.

```bash
brew install playwright-cli   # one-time, provides the Chromium build the suite reuses
npm run test:e2e
```

It starts the Vite dev server on port 5173 automatically (reusing one you already have running), runs the suite, and prints results to the terminal. `test-results/` and `playwright-report/` (gitignored) hold failure traces/screenshots when a test fails.

## Local API development

`npm run dev` (Vite alone) doesn't serve `functions/api/` — it has no proxy, so
`fetch('/api/...')` just falls through to Vite's SPA fallback and returns the
`index.html` shell instead of JSON. For anything that touches the backend
(decks, reviews, WaniKani sync), use `npm run dev:api` instead, which builds
and serves the whole app — frontend and Functions — through `wrangler pages
dev` on `localhost:8788`.

Importing an Anki deck also needs the separate `workflows/anki-import` Worker
running (`npm run dev:workflow`) — Cloudflare Pages Functions can't host a
Workflow directly (see `wrangler.toml`'s `[[services]]` comment), so
`dev:api`'s media-processing calls have nowhere to go without it. Run both
side by side; `dev:workflow` passes `--persist-to` so its Worker shares
`dev:api`'s local D1/R2 state rather than starting with its own empty copy —
without that flag, media import fails with `D1_ERROR: no such table` (or
worse, silently succeeds against a database with no data in it).

There's no local stand-in for Cloudflare Access either: `Cf-Access-*`
headers only exist in production, so a plain local request to any
signed-in-gated endpoint 401s. Add
`Cf-Access-Authenticated-User-Email: <any value>` yourself — e.g. a browser
extension like ModHeader for manual testing, or set it directly when driving
requests via curl/Playwright.

## WaniKani listening quiz

The listening quiz (`#/listening-quiz`) reads its word cache — WaniKani
vocabulary, meanings, readings, and pronunciation audio URLs — from D1's
`wanikani_words` table (`migrations/0002_create_wanikani_words.sql`) via
`GET /api/wanikani-words`. Nothing WaniKani-sourced (words, meanings, audio
URLs, or the API key) ever touches the repo.

**Production**: click the "Sync from WaniKani" button at the top of the
quiz page. It calls `POST /api/wanikani-words/sync`
(`functions/api/wanikani-words/sync.js`), which runs entirely server-side —
fetches from your WaniKani account and replaces D1's cache — using a
`WANIKANI_API_KEY` Cloudflare Pages secret that never reaches the browser.

That secret is provisioned automatically on every deploy, validated and
applied against `.github/prod.template.yaml` — the manifest of every env
var Cloudflare Pages needs:

```yaml
WANIKANI_API_KEY: ${{ secrets.WANIKANI_API_KEY }}
WANIKANI_MIN_SRS_STAGE: "6"
```

A `${{ secrets.NAME }}` value means "read the GitHub Actions secret NAME"
(deploy fails fast if it's not set); a literal string means "apply this
plain, non-secret value directly" — that's how `WANIKANI_MIN_SRS_STAGE` is
set (currently 6/Guru II — lowered from the code's own 7/Master fallback
since too few words have reached Master yet), no secret involved. (That
expression syntax
only evaluates live inside workflow YAML — here it's a convention
`deploy.yml`'s steps parse themselves.)

One-time setup: add a repo secret named `WANIKANI_API_KEY` (Settings →
Secrets and variables → Actions) with your WaniKani token as the value.

To add a future secret-sourced var: add a `NAME: ${{ secrets.NAME }}` line
to `prod.template.yaml`, add the `NAME` repo secret, **and** wire
`NAME: ${{ secrets.NAME }}` into the `env:` block of both
`deploy.yml` steps that reference the template (`Validate required secrets
are present` and `Apply config to Cloudflare Pages`) — referencing each
secret by name, rather than dumping every repo secret at once, is what
keeps zizmor's CI scan clean.

**Local development**: `npm run sync:wanikani` populates your *local* D1
instead, so you can build against realistic data without touching
production:

```bash
cp .env.example .env   # then fill in WANIKANI_API_KEY (Settings → API Tokens on wanikani.com)
npm run sync:wanikani  # defaults to srs_stage >= 6 (Guru II) — lower than prod's Master, for more sample data
```

Override the threshold with `WANIKANI_MIN_SRS_STAGE` in `.env` or
`--min-srs-stage=N` on the command line.

`wrangler` (via `npm run dev:api` or `npm test`) also auto-loads this same
root `.env` into the Functions' local environment — so once it's filled in,
the "Sync from WaniKani" **button** works locally too, against local D1,
with no separate config. One consequence worth knowing: it means those
commands exercise the *real* WaniKani API using your key while `.env` is
populated, not a mock.

## Building & hosting

```bash
npm run build
```

This produces `dist/index.html` plus a couple of bundled asset files. Because routing uses hash-based URLs (`#/reference`, `#/flashcards/s`, ...), the build works unmodified when:

- opened directly via `file://`,
- served by any plain static file server (`npx serve dist`, `python -m http.server`, etc.), or
- hosted on any static host,

with no server-side rewrite rules required.

## Tech stack

- [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`)
- [Vue Router 4](https://router.vuejs.org/) (hash history)
- [Vite](https://vitejs.dev/) — dev server and build
- [Tailwind CSS 4](https://tailwindcss.com/) — utility-first styling, with a small set of custom design tokens (`bg-surface`, `text-muted`, `border-accent`, etc.) that drive light/dark theming
- [Vitest](https://vitest.dev/) + [@vue/test-utils](https://test-utils.vuejs.org/) — unit testing
- [Playwright](https://playwright.dev/) — local-only e2e testing (see [E2E tests](#e2e-tests))

## Project structure

```text
index.html
vite.config.js
playwright.config.js
scripts/
└── sync-wanikani-words.mjs  # Refreshes D1's wanikani_words table from your WaniKani account
tests/
└── e2e/                  # Playwright e2e specs (local only, see E2E tests)
src/
├── main.js              # App bootstrap
├── App.vue               # Layout: header, tab nav, router outlet
├── router.js              # Routes for reference / flashcards / writing / katakana / vocab / vocab-flashcards / listening-quiz
├── data/
│   ├── kana.js            # Canonical hiragana dataset + practice groups
│   ├── katakana.js        # Canonical katakana dataset + practice groups (mirrors kana.js)
│   ├── words.js           # Curated N5 vocabulary (kanji/kana/meaning/category) + category groups
│   └── decks.js           # Deck registry (which card ids belong to which spaced-repetition deck)
├── composables/
│   ├── useCardSession.js         # Shared flashcard session engine (shuffle/reveal/grade)
│   ├── useFlashcardSession.js    # Hiragana flashcards, built on useCardSession
│   ├── useKatakanaFlashcardSession.js # Katakana flashcards, built on useCardSession
│   ├── useVocabFlashcardSession.js # Vocabulary flashcards, built on useCardSession
│   ├── useWanikaniWords.js       # Loads the D1-backed word cache via GET /api/wanikani-words
│   ├── useWanikaniSync.js        # Triggers POST /api/wanikani-words/sync (the "Sync from WaniKani" button)
│   ├── useListeningQuizSession.js # WaniKani listening quiz session engine
│   ├── useWritingExercise.js
│   └── useTheme.js
├── components/
│   ├── ReferenceTables.vue
│   ├── KanaTable.vue
│   ├── Flashcards.vue
│   ├── WritingExercise.vue
│   ├── KatakanaReferenceTables.vue
│   ├── KatakanaFlashcards.vue
│   ├── VocabReference.vue
│   ├── VocabCard.vue
│   ├── VocabFlashcards.vue
│   ├── ListeningQuiz.vue
│   ├── CharacterButton.vue
│   └── AppButton.vue
└── style.css              # Tailwind import + theme tokens
```

## Scope

Hiragana, katakana, and core N5 vocabulary (with kanji) are covered today, plus a WaniKani-sourced listening quiz; grammar and reading comprehension are future pillars still out of scope. Katakana has reference charts and flashcards but no writing exercise yet — that needs its own curated katakana loanword list. No accounts; the dark/light mode choice and spaced-repetition review state (for signed-in users, via Cloudflare Access) are the only things persisted across visits.
