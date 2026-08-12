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
| `npm run test` | Run the test suite (Vitest) |

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
- [Vitest](https://vitest.dev/) + [@vue/test-utils](https://test-utils.vuejs.org/) — testing

## Project structure

```text
index.html
vite.config.js
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
