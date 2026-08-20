<template>
  <div>
    <h2 class="mb-3 text-xl leading-tight font-semibold">Text to Speech</h2>
    <p class="mb-3 text-sm text-muted">Paste any Japanese text and hear it read aloud.</p>
    <textarea
      v-model="text"
      rows="6"
      placeholder="ここに日本語を入力してください..."
      class="w-full rounded-lg border border-border bg-surface p-3 text-lg"
    ></textarea>
    <div class="mt-3 flex items-center justify-center gap-2">
      <label for="rate" class="text-sm text-muted">Speed</label>
      <input id="rate" v-model.number="rate" type="range" min="0.5" max="1.5" step="0.1" class="w-32" />
      <span class="w-10 text-sm text-muted">{{ rate.toFixed(1) }}x</span>
    </div>
    <div class="mt-3 flex justify-center">
      <AppButton variant="primary" :disabled="!text.trim()" @click="speak(text)"> 🔊 Play </AppButton>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useSpeech } from '../composables/useSpeech.js'
import AppButton from './AppButton.vue'

const text = ref('')
const { speak, rate } = useSpeech()
</script>
