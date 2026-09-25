import { createRouter, createWebHashHistory } from 'vue-router'
import ReferenceTables from './components/ReferenceTables.vue'
import Flashcards from './components/Flashcards.vue'
import WritingExercise from './components/WritingExercise.vue'
import KatakanaReferenceTables from './components/KatakanaReferenceTables.vue'
import KatakanaFlashcards from './components/KatakanaFlashcards.vue'
import VocabReference from './components/VocabReference.vue'
import VocabFlashcards from './components/VocabFlashcards.vue'
import KanjiReferenceTables from './components/KanjiReferenceTables.vue'
import ListeningQuiz from './components/ListeningQuiz.vue'
import TextToSpeech from './components/TextToSpeech.vue'
import WanikaniSrs from './components/WanikaniSrs.vue'

// meta.group clusters routes into one nav dropdown per pillar (Hiragana /
// Katakana / Vocabulary), so adding a same-shaped pillar later is just more
// routes with the same group name — see App.vue's navItems, which builds
// the nested nav straight from this table.
export const routes = [
  { path: '/', redirect: '/reference' },
  { path: '/reference', name: 'reference', component: ReferenceTables, meta: { group: 'Hiragana', label: 'Reference' } },
  {
    // :scope is optional — /flashcards is the scope picker, /flashcards/:scope
    // is an active session for that row/group, so picking a scope is a real
    // navigation (back button returns to the picker) rather than local state.
    // :scope may be a comma-separated list of group ids (e.g. "a,k,s") to
    // practice several rows/tables together in one session.
    path: '/flashcards/:scope?',
    name: 'flashcards',
    component: Flashcards,
    meta: { group: 'Hiragana', label: 'Flashcards' },
  },
  {
    path: '/writing',
    name: 'writing',
    component: WritingExercise,
    meta: { group: 'Hiragana', label: 'Writing Exercise' },
  },
  {
    path: '/katakana-reference',
    name: 'katakana-reference',
    component: KatakanaReferenceTables,
    meta: { group: 'Katakana', label: 'Reference' },
  },
  {
    // Same :scope convention as /flashcards, but the scope is a katakana
    // row/table id instead of a hiragana one.
    path: '/katakana-flashcards/:scope?',
    name: 'katakana-flashcards',
    component: KatakanaFlashcards,
    meta: { group: 'Katakana', label: 'Flashcards' },
  },
  { path: '/vocab', name: 'vocab', component: VocabReference, meta: { group: 'Vocabulary', label: 'Reference' } },
  {
    // Same :scope convention as /flashcards, but the scope is a vocab
    // category id (or comma-separated list of them) instead of a kana row/table.
    path: '/vocab-flashcards/:scope?',
    name: 'vocab-flashcards',
    component: VocabFlashcards,
    meta: { group: 'Vocabulary', label: 'Flashcards' },
  },
  // Reference-only pillar — flashcard drilling for these already happens
  // in WaniKani, so unlike the other pillars there's no matching
  // flashcards/writing route here, just the table.
  {
    path: '/kanji-reference',
    name: 'kanji-reference',
    component: KanjiReferenceTables,
    meta: { group: 'Kanji', label: 'Reference' },
  },
  // Words cached from WaniKani (scripts/sync-wanikani-words.mjs) at or above
  // a given SRS stage: hear the pronunciation audio, type the English
  // meaning. Lives in the Kanji group alongside the reference table.
  {
    path: '/listening-quiz',
    name: 'listening-quiz',
    component: ListeningQuiz,
    meta: { group: 'Kanji', label: 'Listening Quiz' },
  },
  // Every WaniKani item at one SRS stage (Apprentice I … Burned), across all
  // levels, and when each is next up for review — fetched live
  // (functions/api/wanikani/srs-items.js). :stage is the numeric SRS stage
  // (0 = lessons … 9 = burned); omitted, the page shows just the picker.
  {
    path: '/wanikani-srs/:stage?',
    name: 'wanikani-srs',
    component: WanikaniSrs,
    meta: { group: 'Kanji', label: 'WaniKani SRS' },
  },
  // No group — a standalone tool, not tied to any one pillar, so it gets
  // its own flat top-level nav item instead of living in a dropdown.
  { path: '/speak', name: 'speak', component: TextToSpeech, meta: { label: 'Text to Speech' } },
  // Imported Anki decks (specs/003-anki-deck-import) — a standalone pillar
  // like Text to Speech, not nested under an existing one. /decks/:deckId
  // has no nav entry of its own (reached by clicking a deck in the manager),
  // same convention as the :scope sub-routes above. Lazy-loaded: the
  // zip/SQLite/zstd parsing stack (shared/data/ankiImport.js) is only needed by
  // visitors who actually use this pillar, and is heavy enough (fflate,
  // sql.js's wasm, fzstd) to keep out of everyone else's initial bundle.
  { path: '/decks', name: 'decks', component: () => import('./components/DeckManager.vue'), meta: { label: 'Decks' } },
  { path: '/decks/:deckId', name: 'deck-flashcards', component: () => import('./components/DeckFlashcards.vue') },
]

// Hash history (not createWebHistory) so the built dist/index.html keeps
// working unmodified on any static host or opened via file:// — the
// fragment is never sent to a server, so no rewrite rules are needed
// (FR-016). See research.md's Amendment 2 for the full rationale.
export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
