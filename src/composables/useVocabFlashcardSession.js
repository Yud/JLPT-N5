import { getWordsForCategory } from '../data/words.js'
import { useCardSession } from './useCardSession.js'

/**
 * Drives a single vocabulary flashcard practice session for a given scope
 * (a category id, "all", or an array combining several of those) — see
 * contracts/composables.contract.md.
 */
export function useVocabFlashcardSession(scopeId) {
  return useCardSession(scopeId, getWordsForCategory)
}
