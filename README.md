# Hiragana Learning App

A small, fully client-side app for learning Japanese hiragana — reference charts, flashcards, and a writing exercise. Built with Vue 3 + Vite, styled with Tailwind CSS, and ships as a single static `index.html` with no backend.

## Features

- **Reference charts** — the base hiragana table (a/k/s/t/n/h/m/y/r/w), the dakuten/handakuten table (voiced and semi-voiced sounds), and the combinations (yōon) table, every cell showing the character and its romanized reading.
- **Flashcards** — pick a scope (a single row, a table group, or all characters) and step through a shuffled deck, revealing each answer on demand.
- **Writing exercises** — given a word in romaji (e.g. "sushi"), spell it by clicking the correct hiragana out of a shuffled grid that includes distractor characters.
- **Dark mode** — toggle in the header; respects your system preference on first visit and remembers your choice.
- **Routing** — each section has its own URL (including a picked flashcard scope, e.g. `#/flashcards/s`), so the browser back/forward buttons work as expected.

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

## E2E tests

`tests/e2e/` holds [Playwright](https://playwright.dev/) tests that drive the app in a real browser (dev server + Chromium), as opposed to Vitest's component-level unit tests.

**Local only, intentionally not run in CI.** `npm test` — the only test command CI's `deploy.yml` runs — is Vitest alone; `npm run test:e2e` is a separate script CI never calls. `playwright.config.js` also throws immediately if `CI` is set, as a second guard in case that ever changes by accident.

The suite reuses the Chromium build already managed by the [`playwright-cli`](https://formulae.brew.sh/formula/playwright-cli) Homebrew formula (`brew install playwright-cli`) instead of having `@playwright/test` download and manage its own copy — avoids a second multi-hundred-MB browser binary on disk. `playwright.config.js` looks up whatever `chromium-<rev>` build is already cached under `~/Library/Caches/ms-playwright` and launches that directly.

```bash
brew install playwright-cli   # one-time, provides the Chromium build the suite reuses
npm run test:e2e
```

It starts the Vite dev server on port 5173 automatically (reusing one you already have running), runs the suite, and prints results to the terminal. `test-results/` and `playwright-report/` (gitignored) hold failure traces/screenshots when a test fails.

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
tests/
└── e2e/                  # Playwright e2e specs (local only, see E2E tests)
src/
├── main.js              # App bootstrap
├── App.vue               # Layout: header, tab nav, router outlet
├── router.js              # Routes for reference / flashcards / writing
├── data/
│   ├── kana.js            # Canonical hiragana dataset + practice groups
│   └── words.js           # Curated vocabulary for writing exercises
├── composables/
│   ├── useFlashcardSession.js
│   ├── useWritingExercise.js
│   └── useTheme.js
├── components/
│   ├── ReferenceTables.vue
│   ├── KanaTable.vue
│   ├── Flashcards.vue
│   ├── WritingExercise.vue
│   ├── CharacterButton.vue
│   └── AppButton.vue
└── style.css              # Tailwind import + theme tokens
```

## Scope

Hiragana only — katakana and kanji are out of scope. No accounts, backend, or persistence of learning progress between browser sessions; the dark/light mode choice is the one thing remembered across visits (via `localStorage`).
