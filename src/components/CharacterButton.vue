<template>
  <button
    type="button"
    class="min-h-10 min-w-10 cursor-pointer rounded-lg border border-border bg-surface text-lg text-text transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-12 sm:min-w-12 sm:text-xl"
    :disabled="disabled"
    @click="emit('select', character)"
  >
    {{ character.kana }}
  </button>
</template>

<script setup>
defineProps({
  character: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['select'])
</script>
