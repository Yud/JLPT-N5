import { ref } from 'vue'
import { KANA } from '../data/kana.js'

// Standard Fisher–Yates shuffle (unbiased, unlike `sort(() => Math.random() - 0.5)`).
function shuffle(items) {
  const result = items.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function tablesNeededFor(word) {
  const tables = new Set(['base'])
  for (const glyph of word.kana) {
    const entry = KANA.find((c) => c.kana === glyph)
    if (entry) tables.add(entry.table)
  }
  return tables
}

// Builds the shuffled, distractor-filled button set for a word: the union of
// every full table the word's characters belong to (FR-010a). A repeated
// glyph gets a single button that stays clickable until it's been used as
// many times as the word needs it — see isExhausted() below (FR-014) —
// rather than one disposable button instance per occurrence, which left a
// learner unable to find the (visually identical, randomly placed) leftover
// button for a glyph's second use.
function buildButtons(word) {
  const tables = tablesNeededFor(word)
  let uid = 0
  const buttons = KANA.filter((c) => tables.has(c.table)).map((c) => ({ ...c, uid: uid++ }))
  return shuffle(buttons)
}

/**
 * Drives a sequence of writing exercises over a word list — see
 * contracts/composables.contract.md (FR-010..FR-014a).
 */
export function useWritingExercise(wordList) {
  const queue = ref([])
  const currentWord = ref(null)
  const buttons = ref([])
  const selected = ref([])
  const status = ref('in-progress')

  function nextWord() {
    if (queue.value.length === 0) {
      queue.value = shuffle(wordList)
    }
    const [word, ...rest] = queue.value
    queue.value = rest
    currentWord.value = word
    buttons.value = buildButtons(word)
    selected.value = []
    status.value = 'in-progress'
  }

  function select(character) {
    if (status.value !== 'in-progress') return
    const nextSelected = [...selected.value, character]
    selected.value = nextSelected
    const position = nextSelected.length - 1
    if (character.kana !== currentWord.value.kana[position]) {
      status.value = 'incorrect'
    } else if (nextSelected.length === currentWord.value.kana.length) {
      status.value = 'correct'
    }
  }

  function undoLast() {
    selected.value = selected.value.slice(0, -1)
    status.value = 'in-progress'
  }

  function clearAttempt() {
    selected.value = []
    status.value = 'in-progress'
  }

  // A button is exhausted (and should disable) once its glyph has been
  // selected as many times as currentWord needs it — not after a single
  // click — so a repeated glyph stays available for its later
  // occurrence(s). Glyphs the word doesn't need at all (distractors) are
  // never exhausted, so they stay clickable as wrong answers (FR-010a).
  function isExhausted(character) {
    const needed = currentWord.value.kana.filter((k) => k === character.kana).length
    if (needed === 0) return false
    const used = selected.value.filter((s) => s.kana === character.kana).length
    return used >= needed
  }

  nextWord()

  return { currentWord, buttons, selected, status, select, undoLast, clearAttempt, nextWord, isExhausted }
}
