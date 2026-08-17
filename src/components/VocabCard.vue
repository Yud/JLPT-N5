<template>
  <div class="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface p-3 text-center">
    <span class="text-2xl">{{ word.kanji }}</span>
    <span v-if="word.kanji !== word.kana.join('')" class="text-sm text-muted">{{ word.kana.join('') }}</span>
    <span class="text-sm text-muted">{{ word.meaning }}</span>
  </div>
</template>

<script setup>
defineProps({
  word: { type: Object, required: true },
})
</script>
