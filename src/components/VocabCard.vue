<template>
  <div class="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface p-3 text-center">
    <div class="flex items-center gap-1">
      <span class="text-2xl">{{ word.kanji }}</span>
      <button
        type="button"
        class="cursor-pointer rounded-full p-1 text-muted transition-colors hover:bg-surface-hover hover:text-text"
        aria-label="Play pronunciation"
        @click="speak(word.kanji)"
      >
        🔊
      </button>
    </div>
    <span v-if="word.kanji !== word.kana.join('')" class="text-sm text-muted">{{ word.kana.join('') }}</span>
    <span class="text-sm text-muted">{{ word.meaning }}</span>
  </div>
</template>

<script setup>
import { useSpeech } from '../composables/useSpeech.js'

defineProps({
  word: { type: Object, required: true },
})

const { speak } = useSpeech()
</script>
