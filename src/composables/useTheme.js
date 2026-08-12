import { ref } from 'vue'

const STORAGE_KEY = 'hiragana-app-theme'

function detectPreferredTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function loadInitialTheme() {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : detectPreferredTheme()
}

function applyTheme(value) {
  document.documentElement.setAttribute('data-theme', value)
  localStorage.setItem(STORAGE_KEY, value)
}

// Module-scope ref: one shared theme for the whole app, not a fresh instance
// per caller (unlike useFlashcardSession/useWritingExercise).
const theme = ref(loadInitialTheme())
applyTheme(theme.value)

export function useTheme() {
  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    applyTheme(theme.value)
  }
  return { theme, toggleTheme }
}
