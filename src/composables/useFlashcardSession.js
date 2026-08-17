import { getCharactersForGroup } from '../data/kana.js'
import { useCardSession } from './useCardSession.js'

/**
 * Drives a single hiragana flashcard practice session for a given scope
 * (a row id, a table id, "all", or an array combining several of those)
 * — see contracts/composables.contract.md.
 */
export function useFlashcardSession(scopeId) {
  return useCardSession(scopeId, getCharactersForGroup)
}
