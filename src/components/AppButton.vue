<template>
  <button
    type="button"
    class="cursor-pointer rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
    :class="
      variant === 'primary'
        ? 'border-accent bg-accent text-accent-text hover:opacity-90'
        : 'border-border bg-surface text-text hover:bg-surface-hover'
    "
    :disabled="disabled"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>

<script setup>
defineProps({
  variant: { type: String, default: 'secondary' }, // 'primary' | 'secondary'
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['click'])
</script>
