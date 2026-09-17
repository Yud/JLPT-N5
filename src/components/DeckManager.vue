<template>
  <div>
    <h2 class="mb-3 text-xl leading-tight font-semibold">Decks</h2>

    <div class="mb-6 rounded-xl border border-border bg-surface p-4">
      <h3 class="mb-2 font-medium">Import an Anki deck</h3>
      <p class="mb-3 text-sm text-muted">Upload a <code>.apkg</code> export — its cards and media become a new deck here.</p>
      <input ref="fileInput" type="file" accept=".apkg" class="hidden" @change="onFileChosen" />
      <AppButton
        variant="primary"
        :disabled="['parsing', 'uploading', 'processing'].includes(importer.status.value)"
        @click="fileInput.click()"
      >
        Choose file…
      </AppButton>

      <div v-if="importer.status.value === 'parsing'" class="mt-3 text-sm text-muted">Reading the file…</div>
      <div v-else-if="importer.status.value === 'uploading'" class="mt-3 text-sm text-muted">
        Uploading deck {{ importer.progress.value.decksImported + 1 }} of {{ importer.progress.value.decksTotal }}
        <template v-if="importer.progress.value.mediaTotal > 0">
          (media {{ importer.progress.value.mediaUploaded }} / {{ importer.progress.value.mediaTotal }})
        </template>
      </div>
      <div v-else-if="importer.status.value === 'processing'" class="mt-3 text-sm text-muted">
        Processing media {{ importer.progress.value.mediaProcessed }} / {{ importer.progress.value.mediaProcessTotal }} (deck
        {{ importer.progress.value.decksImported + 1 }} of {{ importer.progress.value.decksTotal }})
      </div>
      <p v-else-if="importer.status.value === 'done'" class="mt-3 text-sm text-green-700 dark:text-green-400">
        {{ importer.message.value }}
      </p>
      <p v-else-if="importer.status.value === 'error'" class="mt-3 text-sm text-red-700 dark:text-red-400">
        {{ importer.message.value }}
      </p>
    </div>

    <div v-if="loadError" class="text-sm text-red-700 dark:text-red-400">{{ loadError }}</div>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="deck in decks" :key="deck.id" class="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
        <RouterLink v-if="deck.type === 'imported'" :to="{ name: 'deck-flashcards', params: { deckId: deck.id } }" class="hover:underline">
          {{ deck.name }} <span class="text-sm text-muted">({{ deck.cardCount }} cards)</span>
        </RouterLink>
        <span v-else>{{ deck.name }} <span class="text-sm text-muted">({{ deck.cardCount }} cards, built-in)</span></span>
        <AppButton v-if="deck.type === 'imported'" variant="danger" @click="removeDeck(deck)">Delete</AppButton>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useDeckImport } from '../composables/useDeckImport.js'
import AppButton from './AppButton.vue'

const importer = useDeckImport()
const fileInput = ref(null)
const decks = ref([])
const loadError = ref('')

async function loadDecks() {
  try {
    const response = await fetch('/api/decks')
    if (!response.ok) throw new Error(`Failed to load decks: ${response.status}`)
    const body = await response.json()
    decks.value = body.decks
    loadError.value = ''
  } catch (err) {
    loadError.value = err.message || 'Failed to load decks.'
  }
}

async function onFileChosen(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // allow re-selecting the same file later
  if (!file) return
  await importer.importFile(file)
  if (importer.status.value === 'done') await loadDecks()
}

async function removeDeck(deck) {
  if (!confirm(`Delete "${deck.name}"? This removes its cards, media, and review history.`)) return
  const response = await fetch(`/api/decks/${deck.id}`, { method: 'DELETE' })
  if (response.ok || response.status === 404) await loadDecks()
}

onMounted(loadDecks)
</script>
