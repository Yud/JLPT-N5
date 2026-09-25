<template>
  <span class="inline-flex items-center gap-1.5">
    <span v-if="visible">{{ text }}</span>
    <span v-else class="tracking-widest text-muted select-none" aria-label="Hidden">••••••</span>
    <button
      type="button"
      class="inline-flex cursor-pointer rounded p-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-text"
      :aria-label="visible ? `Hide ${label}` : `Show ${label}`"
      :aria-pressed="visible"
      @click="emit('toggle')"
    >
      <UIcon :name="visible ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
    </button>
  </span>
</template>

<script setup>
// Password-field-style reveal: masked text plus an eye button. Stateless —
// the parent owns visibility, so a page-wide "show all" switch and
// per-cell toggles can share one source of truth.
defineProps({
  text: { type: String, required: true },
  visible: { type: Boolean, required: true },
  // What's being revealed, for the button's aria-label ("meaning", "reading").
  label: { type: String, required: true },
})

const emit = defineEmits(['toggle'])
</script>
