<template>
  <div>
    <div v-if="!session">
      <h2 class="mb-3 text-xl leading-tight font-semibold">Choose a category</h2>
      <p class="mb-3 text-sm text-muted">Pick one or more categories, then start.</p>
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
        :to="{ name: 'vocab-flashcards' }"
        class="mb-3 inline-block text-sm text-muted hover:text-text hover:underline"
      >
        ← Back to category picker
      </RouterLink>
      <p class="text-sm text-muted">{{ scopeSummary }}</p>
      <p>Card {{ session.progress.value.index }} / {{ session.progress.value.total }}</p>

      <div v-if="!session.complete.value">
        <div class="my-6 flex w-full items-center justify-center gap-4">
          <!-- Mirrors the skip button's footprint on the opposite side, so the
               card stays centered on the row regardless of whether the skip
               button is visible — reveal never shifts the card. -->
          <div class="h-16 w-16 shrink-0" aria-hidden="true"></div>
          <button
            type="button"
            class="flex h-48 w-full max-w-xs cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface shadow-sm transition-colors hover:bg-surface-hover disabled:cursor-default disabled:hover:bg-surface"
            :disabled="session.revealed.value"
            @click="session.reveal()"
          >
            <span class="text-4xl">{{ session.currentCharacter.value.kanji }}</span>
            <span v-if="session.currentCharacter.value.kanji !== session.currentCharacter.value.kana.join('')" class="text-xl text-muted">
              {{ session.currentCharacter.value.kana.join('') }}
            </span>
            <span v-if="session.revealed.value" class="text-2xl text-muted">
              {{ session.currentCharacter.value.meaning }}
            </span>
          </button>
          <button
            type="button"
            class="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-3xl text-muted shadow-sm transition-colors hover:bg-surface-hover hover:text-text"
            :title="session.revealed.value ? 'Skip without grading' : 'Reveal answer'"
            :aria-label="session.revealed.value ? 'Skip to next card without grading' : 'Reveal answer'"
            @click="session.revealed.value ? session.next() : session.reveal()"
          >
            {{ session.revealed.value ? '›' : '?' }}
          </button>
        </div>
        <div v-if="session.revealed.value" class="flex flex-wrap justify-center gap-2">
          <AppButton variant="danger" aria-label="Again" @click="session.grade('again')"
            ><span class="text-xl">😤</span> <span class="hidden sm:inline">Again</span></AppButton
          >
          <AppButton variant="warning" aria-label="Hard" @click="session.grade('hard')"
            ><span class="text-xl">🙄</span> <span class="hidden sm:inline">Hard</span></AppButton
          >
          <AppButton variant="success" aria-label="Good" @click="session.grade('good')"
            ><span class="text-xl">😏</span> <span class="hidden sm:inline">Good</span></AppButton
          >
          <AppButton variant="info" aria-label="Easy" @click="session.grade('easy')"
            ><span class="text-xl">😎</span> <span class="hidden sm:inline">Easy</span></AppButton
          >
        </div>
      </div>

      <div v-else class="flex flex-wrap gap-2">
        <p class="w-full">Session complete!</p>
        <AppButton @click="session.restart()">Restart this category</AppButton>
        <AppButton @click="chooseNewScope">Choose a different category</AppButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { shallowRef, reactive, computed, onActivated } from 'vue'
import { useRoute, useRouter, onBeforeRouteUpdate } from 'vue-router'
import { getVocabCategories } from '../data/words.js'
import { useVocabFlashcardSession } from '../composables/useVocabFlashcardSession.js'
import AppButton from './AppButton.vue'

const groups = getVocabCategories()
const route = useRoute()
const router = useRouter()

// Category ids selected in the picker, before a session has started. Picking
// "All words" clears any other picks (they'd be redundant) and vice versa,
// since selecting anything else no longer means "all".
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

// The picked scope(s) live in the URL (/vocab-flashcards/:scope, a
// comma-separated list of category ids) so it's shareable and the browser
// back button returns to the picker. `currentScope` tracks what `session`
// currently represents so we only rebuild it when the scope actually
// changes — this component stays mounted via <KeepAlive> (App.vue) while
// another tab is active, and both onBeforeRouteUpdate (param changes while
// this route is active, e.g. back/forward between scopes) and onActivated
// (returning here after being kept alive elsewhere) can fire with the *same*
// scope as before, in which case the session must survive.
let currentScope = route.params.scope || null
const session = shallowRef(currentScope ? useVocabFlashcardSession(parseScope(currentScope)) : null)

function syncToScope(scope) {
  scope = scope || null
  if (scope === currentScope) return
  currentScope = scope
  session.value = scope ? useVocabFlashcardSession(parseScope(scope)) : null
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
  router.push({ name: 'vocab-flashcards', params: { scope: [...selected].join(',') } })
}

function chooseNewScope() {
  // Prefill the picker with whatever scope was just active, so tweaking a
  // selection doesn't mean starting from scratch.
  selected.clear()
  for (const id of parseScope(currentScope)) selected.add(id)
  router.push({ name: 'vocab-flashcards' })
}
</script>
