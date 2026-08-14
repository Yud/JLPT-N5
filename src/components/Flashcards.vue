<template>
  <div>
    <div v-if="!session">
      <h2 class="mb-3 text-xl leading-tight font-semibold">Choose a practice scope</h2>
      <p class="mb-3 text-sm text-muted">Pick one or more rows or tables, then start.</p>
      <div class="flex flex-wrap justify-center gap-2">
        <AppButton
          v-for="group in groups"
          :key="group.id"
          :variant="selected.has(group.id) ? 'primary' : 'secondary'"
          :aria-pressed="selected.has(group.id)"
          @click="toggleGroup(group.id)"
        >
          {{ group.label }}
        </AppButton>
      </div>
      <div class="mt-4 flex justify-center">
        <AppButton variant="primary" :disabled="selected.size === 0" @click="startSession">
          Start{{ selected.size ? ` (${selected.size} selected)` : '' }}
        </AppButton>
      </div>
    </div>

    <div v-else>
      <RouterLink
        :to="{ name: 'flashcards' }"
        class="mb-3 inline-block text-sm text-muted hover:text-text hover:underline"
      >
        ← Back to scope picker
      </RouterLink>
      <p class="text-sm text-muted">{{ scopeSummary }}</p>
      <p>Card {{ session.progress.value.index }} / {{ session.progress.value.total }}</p>

      <div v-if="!session.complete.value">
        <div class="my-6 text-center">
          <div class="text-5xl">{{ session.currentCharacter.value.kana }}</div>
          <div v-if="session.revealed.value" class="text-2xl text-muted">
            {{ session.currentCharacter.value.romaji }}
          </div>
        </div>
        <AppButton v-if="!session.revealed.value" variant="primary" @click="session.reveal()">Reveal</AppButton>
        <AppButton v-else variant="primary" @click="session.next()">Next</AppButton>
      </div>

      <div v-else class="flex flex-wrap gap-2">
        <p class="w-full">Session complete!</p>
        <AppButton @click="session.restart()">Restart this scope</AppButton>
        <AppButton @click="chooseNewScope">Choose a different scope</AppButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { shallowRef, reactive, computed, onActivated } from 'vue'
import { useRoute, useRouter, onBeforeRouteUpdate } from 'vue-router'
import { getPracticeGroups } from '../data/kana.js'
import { useFlashcardSession } from '../composables/useFlashcardSession.js'
import AppButton from './AppButton.vue'

const groups = getPracticeGroups()
const route = useRoute()
const router = useRouter()

// Scope ids selected in the picker, before a session has started. Picking
// "All characters" clears any other picks (they'd be redundant) and vice
// versa, since selecting anything else no longer means "all".
const selected = reactive(new Set())

function toggleGroup(id) {
  if (id === 'all') {
    selected.clear()
    selected.add('all')
    return
  }
  selected.delete('all')
  if (selected.has(id)) selected.delete(id)
  else selected.add(id)
}

function parseScope(scope) {
  return scope ? scope.split(',').filter(Boolean) : []
}

// The picked scope(s) live in the URL (/flashcards/:scope, a comma-separated
// list of group ids) so it's shareable and the browser back button returns
// to the picker. `currentScope` tracks what `session` currently represents
// so we only rebuild it when the scope actually changes — this component
// stays mounted via <KeepAlive> (App.vue) while another tab is active, and
// both onBeforeRouteUpdate (param changes while this route is active, e.g.
// back/forward between scopes) and onActivated (returning here after being
// kept alive elsewhere) can fire with the *same* scope as before, in which
// case the session must survive.
let currentScope = route.params.scope || null
const session = shallowRef(currentScope ? useFlashcardSession(parseScope(currentScope)) : null)

function syncToScope(scope) {
  scope = scope || null
  if (scope === currentScope) return
  currentScope = scope
  session.value = scope ? useFlashcardSession(parseScope(scope)) : null
}

onBeforeRouteUpdate((to) => {
  syncToScope(to.params.scope)
})

onActivated(() => {
  syncToScope(route.params.scope)
})

const scopeSummary = computed(() => {
  const ids = parseScope(route.params.scope)
  const labels = ids.map((id) => groups.find((g) => g.id === id)?.label).filter(Boolean)
  return labels.length ? `Practicing: ${labels.join(', ')}` : ''
})

function startSession() {
  if (selected.size === 0) return
  router.push({ name: 'flashcards', params: { scope: [...selected].join(',') } })
}

function chooseNewScope() {
  // Prefill the picker with whatever scope was just active, so tweaking a
  // selection doesn't mean starting from scratch.
  selected.clear()
  for (const id of parseScope(currentScope)) selected.add(id)
  router.push({ name: 'flashcards' })
}
</script>
