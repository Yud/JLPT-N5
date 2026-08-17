import { createRouter, createWebHashHistory } from 'vue-router'
import ReferenceTables from './components/ReferenceTables.vue'
import Flashcards from './components/Flashcards.vue'
import WritingExercise from './components/WritingExercise.vue'
import VocabReference from './components/VocabReference.vue'
import VocabFlashcards from './components/VocabFlashcards.vue'

export const routes = [
  { path: '/', redirect: '/reference' },
  { path: '/reference', name: 'reference', component: ReferenceTables, meta: { label: 'Reference' } },
  {
    // :scope is optional — /flashcards is the scope picker, /flashcards/:scope
    // is an active session for that row/group, so picking a scope is a real
    // navigation (back button returns to the picker) rather than local state.
    // :scope may be a comma-separated list of group ids (e.g. "a,k,s") to
    // practice several rows/tables together in one session.
    path: '/flashcards/:scope?',
    name: 'flashcards',
    component: Flashcards,
    meta: { label: 'Flashcards' },
  },
  { path: '/writing', name: 'writing', component: WritingExercise, meta: { label: 'Writing Exercise' } },
  { path: '/vocab', name: 'vocab', component: VocabReference, meta: { label: 'Vocabulary' } },
  {
    // Same :scope convention as /flashcards, but the scope is a vocab
    // category id (or comma-separated list of them) instead of a kana row/table.
    path: '/vocab-flashcards/:scope?',
    name: 'vocab-flashcards',
    component: VocabFlashcards,
    meta: { label: 'Vocab Flashcards' },
  },
]

// Hash history (not createWebHistory) so the built dist/index.html keeps
// working unmodified on any static host or opened via file:// — the
// fragment is never sent to a server, so no rewrite rules are needed
// (FR-016). See research.md's Amendment 2 for the full rationale.
export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
