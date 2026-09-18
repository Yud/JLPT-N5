<template>
  <div>
    <RouterLink :to="{ name: 'decks' }" class="mb-3 inline-block text-sm text-muted hover:text-text hover:underline">
      ← Back to decks
    </RouterLink>

    <div v-if="notFound">
      <p>This deck couldn't be found — it may have been deleted.</p>
    </div>

    <div v-else-if="!session">
      <p class="text-sm text-muted">Loading…</p>
    </div>

    <div v-else>
      <p>Card {{ session.progress.value.index }} / {{ session.progress.value.total }}</p>

      <div v-if="!session.complete.value">
        <button
          type="button"
          class="my-6 flex min-h-48 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface p-4 text-center shadow-sm transition-colors hover:bg-surface-hover disabled:cursor-default disabled:hover:bg-surface"
          :disabled="session.revealed.value"
          @click="session.reveal()"
        >
          <!-- eslint-disable-next-line vue/no-v-html -- Anki's own card HTML, best-effort rendered (FR-013); media refs already point at this app's own /api/media endpoint -->
          <div class="card-media" v-html="renderedFront"></div>
          <template v-if="session.revealed.value">
            <hr class="w-full border-border" />
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="card-media" v-html="renderedBack"></div>
          </template>
        </button>

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
        <AppButton @click="session.restart()">Restart this deck</AppButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, shallowRef, ref, onActivated } from 'vue'
import { useRoute, onBeforeRouteUpdate } from 'vue-router'
import { useCardSession } from '../composables/useCardSession.js'
import AppButton from './AppButton.vue'

const route = useRoute()
const notFound = ref(false)
const session = shallowRef(null)
let cachedCards = []

// Anki's `[sound:...]` bracket syntax isn't valid HTML on its own — turn it
// into a real, playable element. Media `<img src="...">` references already
// point at this app's /api/media endpoint (rewritten at import time) and
// need no further transformation.
function renderCardHtml(html) {
  return html.replace(/\[sound:([^\]]+)\]/g, (_match, url) => `<audio controls src="${url}"></audio>`)
}

const renderedFront = computed(() => (session.value?.currentCharacter.value ? renderCardHtml(session.value.currentCharacter.value.front) : ''))
const renderedBack = computed(() => (session.value?.currentCharacter.value ? renderCardHtml(session.value.currentCharacter.value.back) : ''))

async function loadDeck(deckId) {
  session.value = null
  notFound.value = false
  const response = await fetch(`/api/decks/${deckId}/cards`)
  if (response.status === 404) {
    notFound.value = true
    return
  }
  if (!response.ok) throw new Error(`Failed to load deck: ${response.status}`)
  const body = await response.json()
  cachedCards = body.cards
  session.value = useCardSession(deckId, () => cachedCards)
}

let currentDeckId = route.params.deckId
loadDeck(currentDeckId)

function syncToDeck(deckId) {
  if (deckId === currentDeckId) return
  currentDeckId = deckId
  loadDeck(deckId)
}

onBeforeRouteUpdate((to) => {
  syncToDeck(to.params.deckId)
})

onActivated(() => {
  syncToDeck(route.params.deckId)
})
</script>

<style scoped>
/* Anki decks commonly embed full-size illustrations (real-world samples run
   to 800x800+) meant for Anki's own desktop/mobile card view, not a web
   flashcard tile — left unconstrained, one image can push the whole card
   past the viewport. Capped and centered here instead of at import time so
   the original media stays untouched (e.g. for a future full-size view). */
.card-media :deep(img) {
  max-width: 100%;
  max-height: 12rem;
  object-fit: contain;
  margin-inline: auto;
}
</style>
