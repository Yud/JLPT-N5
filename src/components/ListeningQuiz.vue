<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <AppButton variant="secondary" :disabled="syncStatus === 'syncing'" @click="handleSync">
        {{ syncStatus === 'syncing' ? 'Syncing…' : '🔄 Sync from WaniKani' }}
      </AppButton>
      <p v-if="syncMessage" class="text-xs text-muted" :class="{ 'text-red-600 dark:text-red-400': syncStatus === 'error' }">
        {{ syncMessage }}
      </p>
    </div>

    <p v-if="status === 'loading'" class="text-sm text-muted">Loading words…</p>

    <p v-else-if="status === 'error'" class="text-sm text-muted">
      Couldn't load the WaniKani word cache. Try reloading the page.
    </p>

    <div v-else-if="!session" class="text-sm text-muted">
      <p>No WaniKani words cached yet. Click "Sync from WaniKani" above to populate it from your account.</p>
    </div>

    <div v-else>
      <p class="text-sm text-muted">Score: {{ session.score.value.correct }} / {{ session.score.value.total }}</p>

      <div v-if="!session.complete.value">
        <p>Word {{ session.progress.value.index + 1 }} / {{ session.progress.value.total }}</p>

        <div class="my-6 flex flex-col items-center gap-4">
          <button
            type="button"
            class="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-4xl shadow-sm transition-colors hover:bg-surface-hover"
            aria-label="Play pronunciation"
            @click="session.playAudio()"
          >
            🔊
          </button>

          <form class="flex w-full max-w-xs flex-col items-center gap-2" @submit.prevent="session.submitAnswer()">
            <input
              ref="answerInput"
              v-model="session.answer.value"
              type="text"
              placeholder="Type the English meaning"
              class="w-full rounded-md border border-border bg-surface px-3 py-2 text-center text-lg disabled:opacity-60"
              :disabled="session.checked.value"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
            />
            <AppButton v-if="!session.checked.value" type="submit" variant="primary">Check</AppButton>
          </form>

          <div v-if="session.checked.value" class="flex flex-col items-center gap-2 text-center">
            <p
              class="text-lg font-semibold"
              :class="session.correct.value ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
            >
              {{ session.correct.value ? 'Correct!' : 'Not quite' }}
            </p>
            <p class="text-2xl">{{ session.currentWord.value.characters }}</p>
            <p v-if="session.currentWord.value.readings.length" class="text-muted">
              {{ session.currentWord.value.readings.join(', ') }}
            </p>
            <p class="text-muted">{{ session.currentWord.value.meanings.join(', ') }}</p>
            <AppButton variant="primary" @click="session.next()">Next</AppButton>
          </div>
        </div>
      </div>

      <div v-else class="flex flex-wrap gap-2">
        <p class="w-full">Session complete! Final score: {{ session.score.value.correct }} / {{ session.score.value.total }}</p>
        <AppButton @click="session.restart()">Restart</AppButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, shallowRef, watch } from 'vue'
import { useWanikaniWords } from '../composables/useWanikaniWords.js'
import { useWanikaniSync } from '../composables/useWanikaniSync.js'
import { useListeningQuizSession } from '../composables/useListeningQuizSession.js'
import AppButton from './AppButton.vue'

const { words, status, reload } = useWanikaniWords()
const { status: syncStatus, message: syncMessage, sync } = useWanikaniSync()
const session = shallowRef(null)
const answerInput = ref(null)

async function handleSync() {
  await sync()
  if (syncStatus.value === 'done') await reload()
}

// (Re)build the session whenever the word list changes — first load, or a
// "Sync from WaniKani" refresh, both update words.value via reload().
watch(
  words,
  (list) => {
    session.value = list.length > 0 ? useListeningQuizSession(list) : null
  },
  { immediate: true },
)

// Auto-play each new word's audio as soon as it becomes current (browsers
// may still block this without a prior user gesture — the 🔊 button is the
// reliable fallback either way) and refocus the answer input so typing can
// start immediately.
watch(
  () => session.value?.currentWord.value,
  (word) => {
    if (!word) return
    session.value.playAudio()
    nextTick(() => answerInput.value?.focus())
  },
)
</script>
