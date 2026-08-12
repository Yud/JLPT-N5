<template>
  <div>
    <div v-if="!session">
      <h2 class="mb-3 text-xl leading-tight font-semibold">Choose a practice scope</h2>
      <div class="flex flex-wrap justify-center gap-2">
        <AppButton v-for="group in groups" :key="group.id" @click="startSession(group.id)">
          {{ group.label }}
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
import { shallowRef, onActivated } from 'vue'
import { useRoute, useRouter, onBeforeRouteUpdate } from 'vue-router'
import { getPracticeGroups } from '../data/kana.js'
import { useFlashcardSession } from '../composables/useFlashcardSession.js'
import AppButton from './AppButton.vue'

const groups = getPracticeGroups()
const route = useRoute()
const router = useRouter()

// The picked scope lives in the URL (/flashcards/:scope) so it's shareable
// and the browser back button returns to the picker. `currentScope` tracks
// what `session` currently represents so we only rebuild it when the scope
// actually changes — this component stays mounted via <KeepAlive> (App.vue)
// while another tab is active, and both onBeforeRouteUpdate (param changes
// while this route is active, e.g. back/forward between scopes) and
// onActivated (returning here after being kept alive elsewhere) can fire
// with the *same* scope as before, in which case the session must survive.
let currentScope = route.params.scope || null
const session = shallowRef(currentScope ? useFlashcardSession(currentScope) : null)

function syncToScope(scope) {
  scope = scope || null
  if (scope === currentScope) return
  currentScope = scope
  session.value = scope ? useFlashcardSession(scope) : null
}

onBeforeRouteUpdate((to) => {
  syncToScope(to.params.scope)
})

onActivated(() => {
  syncToScope(route.params.scope)
})

function startSession(scopeId) {
  router.push({ name: 'flashcards', params: { scope: scopeId } })
}

function chooseNewScope() {
  router.push({ name: 'flashcards' })
}
</script>
