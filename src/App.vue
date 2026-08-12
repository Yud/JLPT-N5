<template>
  <div class="mx-auto max-w-[960px] p-2 sm:p-4">
    <div class="mb-4 flex items-center justify-between gap-4">
      <h1 class="text-2xl leading-tight font-bold sm:text-3xl">Hiragana Learning App</h1>
      <AppButton @click="toggleTheme">{{ theme === 'dark' ? 'Light mode' : 'Dark mode' }}</AppButton>
    </div>
    <nav class="mb-6 flex flex-wrap gap-2 border-b-2 border-border pb-2" role="tablist">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.name"
        :to="{ name: tab.name, params: tab.params }"
        role="tab"
        :aria-selected="route.name === tab.name"
        class="cursor-pointer rounded-t-md border px-4 py-2 text-sm font-medium transition-colors"
        :class="
          route.name === tab.name
            ? 'border-accent bg-accent text-accent-text'
            : 'border-border bg-surface text-text hover:bg-surface-hover'
        "
      >
        {{ tab.label }}
      </RouterLink>
    </nav>
    <main>
      <RouterView v-slot="{ Component }">
        <KeepAlive>
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </main>
  </div>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppButton from './components/AppButton.vue'
import { useTheme } from './composables/useTheme.js'
import { routes } from './router.js'

const { theme, toggleTheme } = useTheme()

const route = useRoute()

// Remembers each route's params from the last time it was visited (e.g. the
// picked Flashcards scope), so clicking a tab returns to where you left off
// instead of always resetting to that route's bare path.
const lastParams = reactive({})
watch(
  () => route.fullPath,
  () => {
    if (route.name) lastParams[route.name] = { ...route.params }
  },
  { immediate: true },
)

// Tab labels/order come from the routes table itself (src/router.js) so the
// tab bar can't drift out of sync with it (SC-005: switching sections is a
// single click on one of these tabs). Deliberately reads the plain `routes`
// array rather than router.getRoutes() — the router reorders routes
// internally once a dynamic segment (Flashcards' :scope) is involved, which
// would silently reshuffle the tab bar's display order.
const tabs = computed(() =>
  routes
    .filter((r) => r.meta?.label)
    .map((r) => ({ name: r.name, label: r.meta.label, params: lastParams[r.name] || {} })),
)
</script>
