// Speaks Japanese text via the browser's built-in Web Speech API — no audio
// files, no server, just whatever TTS voice the visitor's OS/browser
// provides. Prefers macOS's "Kyoko" voice (every device this app is used on
// has it installed and it's noticeably better than the alternatives), falls
// back to any other Japanese voice, and finally to just requesting ja-JP by
// lang if no matching voice is installed at all.
import { ref, watch } from 'vue'

const RATE_STORAGE_KEY = 'hiragana-app-speech-rate'

function loadInitialRate() {
  const stored = Number(localStorage.getItem(RATE_STORAGE_KEY))
  return stored > 0 ? stored : 1
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices()
  return voices.find((v) => v.name === 'Kyoko') || voices.find((v) => v.lang.startsWith('ja')) || null
}

// Module-scope ref: one shared playback rate for the whole app (like
// useTheme's theme), so adjusting it once (e.g. on the Text to Speech page)
// also slows down the vocab pronunciation buttons.
const rate = ref(loadInitialRate())
watch(rate, (value) => localStorage.setItem(RATE_STORAGE_KEY, String(value)))

export function useSpeech() {
  function speak(text) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    window.speechSynthesis.cancel() // stop anything already playing
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = pickVoice()
    if (voice) utterance.voice = voice
    else utterance.lang = 'ja-JP'
    utterance.rate = rate.value
    window.speechSynthesis.speak(utterance)
  }

  return { speak, rate }
}
