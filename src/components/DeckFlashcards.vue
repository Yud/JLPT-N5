<template>
  <div>
    <!-- Mobile: the counter rides the same row as the back link (absolutely centered so its own
         width doesn't push the link over) instead of eating its own full-width row below — see
         the "Card X / Y" line further down, hidden on mobile in favor of this one. -->
    <div class="relative mb-3 flex items-center sm:mb-0 sm:block">
      <RouterLink :to="{ name: 'decks' }" class="inline-block text-sm text-muted hover:text-text hover:underline sm:mb-3">
        ← Back to decks
      </RouterLink>
      <p v-if="session" class="pointer-events-none absolute inset-x-0 text-center text-sm sm:hidden">
        {{ session.progress.value.index }} / {{ session.progress.value.total }}
      </p>
    </div>

    <div v-if="notFound">
      <p>This deck couldn't be found — it may have been deleted.</p>
    </div>

    <div v-else-if="!session">
      <p class="text-sm text-muted">Loading…</p>
    </div>

    <div v-else>
      <p class="hidden sm:block">Card {{ session.progress.value.index }} / {{ session.progress.value.total }}</p>

      <div v-if="!session.complete.value">
        <!-- Duplicated below the card for larger screens, where there's room to scroll-free grade without it.
             Mobile-only here: on a phone, a revealed card (front + back + media) often runs past the fold, so
             a grader relying only on the below copy has to scroll down every single card. -->
        <GradeButtons v-if="session.revealed.value" class="sm:hidden" @grade="session.grade($event)" />

        <button
          type="button"
          class="my-6 flex min-h-48 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface p-4 text-center shadow-sm transition-colors hover:bg-surface-hover disabled:cursor-default disabled:hover:bg-surface"
          :disabled="session.revealed.value"
          @click="session.reveal()"
        >
          <!-- eslint-disable-next-line vue/no-v-html -- Anki's own card HTML, best-effort rendered (FR-013); media refs already point at this app's own /api/media endpoint -->
          <div class="card-media" v-html="renderedFront" @click="playSound"></div>
          <template v-if="session.revealed.value">
            <hr class="w-full border-border" />
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="card-media" v-html="renderedBack" @click="playSound"></div>
          </template>
        </button>

        <GradeButtons v-if="session.revealed.value" @grade="session.grade($event)" />
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
import GradeButtons from './GradeButtons.vue'

const route = useRoute()
const notFound = ref(false)
const session = shallowRef(null)
let cachedCards = []

// Anki's `[sound:...]` bracket syntax isn't valid HTML on its own — turn it
// into a compact play button plus a hidden <audio> it controls (playSound
// below), rather than a full native player — a deck can reference several
// sounds per card (e.g. word + example sentence), and native <audio
// controls> is wide enough that two or three of them no longer fit the
// flashcard tile. Media `<img src="...">` references already point at this
// app's /api/media endpoint (rewritten at import time) and need no further
// transformation.
function renderCardHtml(html) {
  return html.replace(
    /\[sound:([^\]]+)\]/g,
    (_match, url) =>
      `<button type="button" class="sound-btn cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-base transition-colors hover:bg-surface-hover" aria-label="Play audio">🔊</button><audio src="${url}" class="hidden"></audio>`
  )
}

// Event-delegated instead of an inline onclick in the string above (keeps
// executable JS out of the v-html'd markup) — relies on the <audio> always
// immediately following its .sound-btn in renderCardHtml's output. Clicks
// elsewhere in the card intentionally aren't touched here, so they still
// bubble up to the flip button's own @click.
function playSound(event) {
  const button = event.target.closest('.sound-btn')
  if (!button) return
  event.stopPropagation()
  const audio = button.nextElementSibling
  audio.currentTime = 0
  audio.play()
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
  height: 150px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
  margin-inline: auto;
}
</style>
