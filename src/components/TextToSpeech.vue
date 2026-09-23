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
      <label for="voice" class="text-sm text-muted">Voice</label>
      <select id="voice" v-model="voice" class="rounded-lg border border-border bg-surface p-1 text-sm">
        <option value="kyoko">Kyoko (browser)</option>
        <option value="fish">Fish Audio</option>
      </select>
    </div>
    <div class="mt-3 flex items-center justify-center gap-2">
      <label for="rate" class="text-sm text-muted">Speed</label>
      <input id="rate" v-model.number="rate" type="range" min="0.5" max="1.5" step="0.1" class="w-32" />
      <span class="w-10 text-sm text-muted">{{ rate.toFixed(1) }}x</span>
    </div>
    <p v-if="error" class="mt-2 text-center text-sm text-red-500">{{ error }}</p>
    <div class="mt-3 flex justify-center">
      <AppButton variant="primary" :disabled="!text.trim() || loading" @click="play">
        {{ loading ? '...' : '🔊 Play' }}
      </AppButton>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useSpeech } from '../composables/useSpeech.js'
import { useFishSpeech } from '../composables/useFishSpeech.js'
import AppButton from './AppButton.vue'

const text = ref('')
const voice = ref('kyoko')
const loading = ref(false)
const error = ref('')
const { speak: speakKyoko, rate } = useSpeech()
const { speak: speakFish } = useFishSpeech()

async function play() {
  error.value = ''
  if (voice.value === 'kyoko') {
    speakKyoko(text.value)
    return
  }

  loading.value = true
  try {
    await speakFish(text.value, rate.value)
  } catch (err) {
    error.value = err.message || 'Fish Audio playback failed — try again.'
  } finally {
    loading.value = false
  }
}
</script>
