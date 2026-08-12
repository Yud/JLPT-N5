<template>
  <div>
    <h2 class="mb-3 text-xl leading-tight font-semibold">Spell this word</h2>
    <p class="mb-2 text-xl leading-tight font-bold break-words sm:text-2xl">{{ writer.currentWord.value.romaji }}</p>

    <p class="mb-4 min-h-10 text-2xl leading-tight break-words sm:text-[2rem]">
      <span v-for="(char, index) in writer.selected.value" :key="index">{{ char.kana }}</span>
    </p>

    <p v-if="writer.status.value === 'incorrect'" role="alert">Not quite — undo or clear and try again.</p>
    <p v-if="writer.status.value === 'correct'">Correct!</p>

    <div class="mb-4 flex flex-wrap justify-center gap-2">
      <CharacterButton
        v-for="button in writer.buttons.value"
        :key="button.uid"
        :character="button"
        :disabled="isUsed(button) || writer.status.value !== 'in-progress'"
        @select="writer.select"
      />
    </div>

    <div class="flex gap-2">
      <AppButton
        :disabled="writer.selected.value.length === 0 || writer.status.value === 'correct'"
        @click="writer.undoLast()"
      >
        Undo
      </AppButton>
      <AppButton
        :disabled="writer.selected.value.length === 0 || writer.status.value === 'correct'"
        @click="writer.clearAttempt()"
      >
        Clear
      </AppButton>
      <AppButton v-if="writer.status.value === 'correct'" variant="primary" @click="writer.nextWord()">
        Next word
      </AppButton>
    </div>
  </div>
</template>

<script setup>
import { useWritingExercise } from '../composables/useWritingExercise.js'
import { WORDS } from '../data/words.js'
import CharacterButton from './CharacterButton.vue'
import AppButton from './AppButton.vue'

const writer = useWritingExercise(WORDS)

function isUsed(button) {
  return writer.selected.value.some((s) => s.uid === button.uid)
}
</script>
