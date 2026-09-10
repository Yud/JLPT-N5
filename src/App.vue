<template>
  <UApp>
    <UHeader title="JLPT N5 Learning App">
      <UNavigationMenu :items="navItems" :ui="{ childList: 'grid-cols-1' }" />

      <template #right>
        <UButton
          :icon="themeIcon"
          :aria-label="themeLabel"
          color="neutral"
          variant="outline"
          @click="toggleTheme"
        />
      </template>

      <template #body>
        <UNavigationMenu :items="navItems" orientation="vertical" />
      </template>
    </UHeader>

    <div class="mx-auto max-w-[960px] p-2 sm:p-4">
      <main>
        <RouterView v-slot="{ Component }">
          <KeepAlive>
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </main>
    </div>
  </UApp>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from './composables/useTheme.js'
import { routes } from './router.js'

const { theme, toggleTheme } = useTheme()
const themeIcon = computed(() => (theme.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'))
const themeLabel = computed(() => (theme.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'))

const route = useRoute()

// Remembers each route's params from the last time it was visited (e.g. the
// picked Flashcards scope), so clicking a nav item returns to where you left
// off instead of always resetting to that route's bare path.
const lastParams = reactive({})
watch(
  () => route.fullPath,
  () => {
    if (route.name) lastParams[route.name] = { ...route.params }
  },
  { immediate: true },
)

// Nav structure/order comes from the routes table itself (src/router.js) so
// the nav bar can't drift out of sync with it (SC-005: switching sections is
// a single click on one of these items). Deliberately reads the plain
// `routes` array rather than router.getRoutes() — the router reorders routes
// internally once a dynamic segment (Flashcards' :scope) is involved, which
// would silently reshuffle the nav bar's display order.
//
// Routes sharing a meta.group (e.g. "Hiragana") collapse into one dropdown
// item with those routes as children, instead of each getting its own
// top-level slot — otherwise every pillar's Reference/Flashcards/Writing
// routes would crowd the top-level nav individually. Grouping is keyed on
// first appearance order, matching the routes table.
const navItems = computed(() => {
  const items = []
  const groupItems = new Map()
  for (const r of routes) {
    if (!r.meta?.label) continue
    const child = { label: r.meta.label, to: { name: r.name, params: lastParams[r.name] || {} } }
    if (!r.meta.group) {
      items.push(child)
      continue
    }
    let group = groupItems.get(r.meta.group)
    if (!group) {
      group = { label: r.meta.group, children: [] }
      groupItems.set(r.meta.group, group)
      items.push(group)
    }
    group.children.push(child)
  }
  return items
})
</script>
