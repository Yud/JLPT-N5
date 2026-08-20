import { getCharactersForGroup } from '../data/katakana.js'
import { useCardSession } from './useCardSession.js'

/**
 * Drives a single katakana flashcard practice session for a given scope
 * (a row id, a table id, "all", or an array combining several of those).
 * See useFlashcardSession.js, the hiragana equivalent.
 */
export function useKatakanaFlashcardSession(scopeId) {
  return useCardSession(scopeId, getCharactersForGroup)
}
