<template>
  <div class="flex flex-wrap justify-center gap-2">
    <AppButton variant="danger" aria-label="Again" @click="emit('grade', 'again')"
      ><span class="text-xl">😤</span> <span class="hidden sm:inline">Again</span></AppButton
    >
    <AppButton variant="warning" aria-label="Hard" @click="emit('grade', 'hard')"
      ><span class="text-xl">🙄</span> <span class="hidden sm:inline">Hard</span></AppButton
    >
    <AppButton variant="success" aria-label="Good" @click="emit('grade', 'good')"
      ><span class="text-xl">😏</span> <span class="hidden sm:inline">Good</span></AppButton
    >
    <AppButton variant="info" aria-label="Easy" @click="emit('grade', 'easy')"
      ><span class="text-xl">😎</span> <span class="hidden sm:inline">Easy</span></AppButton
    >
  </div>
</template>

<script setup>
import AppButton from './AppButton.vue'

const emit = defineEmits(['grade'])
</script>
