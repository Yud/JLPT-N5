import { ref, computed } from 'vue'
import { playCachedAudio } from './audioCache.js'

// Standard Fisher–Yates shuffle (unbiased, unlike `sort(() => Math.random() - 0.5)`).
function shuffle(items) {
  const result = items.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Loose enough to not fail an answer over stray punctuation or casing, but
// still an exact match on the words themselves — no fuzzy/typo tolerance.
function normalize(text) {
  return text.trim().toLowerCase().replace(/[.,!?'"()]/g, '')
}

/**
 * Drives a listening quiz session: play a WaniKani word's pronunciation
 * audio, type its English meaning, get graded against every accepted
 * meaning (not just the primary one). Takes an explicit word list — loaded
 * from the backend cache by useWanikaniWords.js — the way useWritingExercise
 * takes a wordList, so this stays testable without a network dependency.
 */
export function useListeningQuizSession(words) {
  const order = ref(shuffle(words))
  const index = ref(0)
  const answer = ref('')
  const checked = ref(false)
  const correct = ref(false)
  const score = ref({ correct: 0, total: 0 })

  const complete = computed(() => order.value.length > 0 && index.value >= order.value.length)
  const currentWord = computed(() => (complete.value ? null : (order.value[index.value] ?? null)))
  const progress = computed(() => ({
    index: Math.min(index.value, order.value.length),
    total: order.value.length,
  }))

  function playAudio() {
    const word = currentWord.value
    if (!word || word.audio.length === 0) return
    playCachedAudio(word.audio[0].url)
  }

  function submitAnswer() {
    const word = currentWord.value
    if (!word || checked.value) return
    const given = normalize(answer.value)
    correct.value = given.length > 0 && word.meanings.some((m) => normalize(m) === given)
    checked.value = true
    score.value = { correct: score.value.correct + (correct.value ? 1 : 0), total: score.value.total + 1 }
  }

  function next() {
    if (complete.value) return
    index.value += 1
    answer.value = ''
    checked.value = false
    correct.value = false
  }

  function restart() {
    order.value = shuffle(words)
    index.value = 0
    answer.value = ''
    checked.value = false
    correct.value = false
    score.value = { correct: 0, total: 0 }
  }

  return { currentWord, answer, checked, correct, complete, progress, score, playAudio, submitAnswer, next, restart }
}
