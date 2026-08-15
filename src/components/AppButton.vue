<template>
  <button
    type="button"
    class="cursor-pointer rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
    :class="variantClasses[variant] ?? variantClasses.secondary"
    :disabled="disabled"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>

<script setup>
defineProps({
  // 'primary' | 'secondary' | 'danger' | 'warning' | 'success' | 'info'
  variant: { type: String, default: 'secondary' },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['click'])

const variantClasses = {
  primary: 'border-accent bg-accent text-accent-text hover:opacity-90',
  secondary: 'border-border bg-surface text-text hover:bg-surface-hover',
  danger: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900',
  warning:
    'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900',
  success:
    'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900',
  info: 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900',
}
</script>
