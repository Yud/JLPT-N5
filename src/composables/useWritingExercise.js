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
// every full table the word's characters belong to (FR-010a), plus one extra
// button per repeated glyph beyond its first occurrence (FR-014).
function buildButtons(word) {
  const tables = tablesNeededFor(word)
  let uid = 0
  const buttons = KANA.filter((c) => tables.has(c.table)).map((c) => ({ ...c, uid: uid++ }))

  const counts = {}
  for (const glyph of word.kana) counts[glyph] = (counts[glyph] || 0) + 1
  for (const [glyph, count] of Object.entries(counts)) {
    const entry = KANA.find((c) => c.kana === glyph)
    for (let i = 1; i < count; i++) {
      buttons.push({ ...entry, uid: uid++ })
    }
  }

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

  nextWord()

  return { currentWord, buttons, selected, status, select, undoLast, clearAttempt, nextWord }
}
