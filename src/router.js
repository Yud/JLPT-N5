import { createRouter, createWebHashHistory } from 'vue-router'
import ReferenceTables from './components/ReferenceTables.vue'
import Flashcards from './components/Flashcards.vue'
import WritingExercise from './components/WritingExercise.vue'

export const routes = [
  { path: '/', redirect: '/reference' },
  { path: '/reference', name: 'reference', component: ReferenceTables, meta: { label: 'Reference' } },
  {
    // :scope is optional — /flashcards is the scope picker, /flashcards/:scope
    // is an active session for that row/group, so picking a scope is a real
    // navigation (back button returns to the picker) rather than local state.
    path: '/flashcards/:scope?',
    name: 'flashcards',
    component: Flashcards,
    meta: { label: 'Flashcards' },
  },
  { path: '/writing', name: 'writing', component: WritingExercise, meta: { label: 'Writing Exercise' } },
]

// Hash history (not createWebHistory) so the built dist/index.html keeps
// working unmodified on any static host or opened via file:// — the
// fragment is never sent to a server, so no rewrite rules are needed
// (FR-016). See research.md's Amendment 2 for the full rationale.
export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
