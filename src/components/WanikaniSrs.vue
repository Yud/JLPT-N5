<template>
  <div>
    <div class="mb-4 flex flex-wrap gap-2">
      <AppButton
        v-for="(name, n) in SRS_STAGE_NAMES"
        :key="n"
        :variant="stage === n ? 'primary' : 'secondary'"
        :aria-pressed="stage === n"
        @click="selectStage(n)"
      >
        {{ name }}
      </AppButton>
    </div>

    <p v-if="status === 'idle'" class="text-sm text-muted">Pick an SRS stage to see its items.</p>

    <template v-else>
      <div class="mb-4 flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 text-sm">
          Sort
          <select v-model="sort" class="rounded-md border border-border bg-surface px-2 py-1">
            <option value="next-asc">Next review — soonest first</option>
            <option value="next-desc">Next review — latest first</option>
            <option value="default">WaniKani order</option>
          </select>
        </label>

        <AppButton :disabled="status === 'loading'" @click="reload">🔄 Refresh</AppButton>
      </div>

      <p v-if="status === 'error'" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

      <p v-else-if="status === 'loading'" class="text-sm text-muted">
        Loading {{ SRS_STAGE_NAMES[stage] }} items…{{ total ? ` ${items.length} / ${total}` : '' }}
      </p>

      <p v-else-if="items.length === 0" class="text-sm text-muted">No items at {{ SRS_STAGE_NAMES[stage] }}.</p>

      <div v-else class="w-full overflow-x-auto">
        <p class="mb-2 text-sm text-muted">{{ summary }}</p>
        <table class="w-full border-collapse">
          <thead>
            <tr>
              <th class="border border-border p-2 text-center font-semibold" scope="col">Item</th>
              <th class="border border-border p-2 text-left font-semibold" scope="col">Meaning</th>
              <th class="border border-border p-2 text-left font-semibold" scope="col">Reading</th>
              <th class="border border-border p-2 text-center font-semibold" scope="col">Level</th>
              <th class="border border-border p-2 text-left font-semibold" scope="col">
                <button type="button" class="cursor-pointer hover:underline" @click="toggleNextReviewSort">
                  Next review {{ sort === 'next-asc' ? '▲' : sort === 'next-desc' ? '▼' : '' }}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in pageItems" :key="item.subjectId" class="hover:bg-surface-hover">
              <td class="border border-border p-2 text-center">
                <span
                  class="inline-flex min-w-10 items-center justify-center rounded px-2 py-1 text-xl text-white"
                  :class="TYPE_CLASSES[item.type]"
                  :title="TYPE_LABELS[item.type]"
                >
                  <img
                    v-if="item.characterImageUrl"
                    :src="item.characterImageUrl"
                    :alt="item.meaning"
                    class="h-6 w-6 invert"
                  />
                  <template v-else>{{ item.characters }}</template>
                </span>
              </td>
              <td class="border border-border p-2">{{ item.meaning }}</td>
              <td class="border border-border p-2">{{ item.reading ?? '—' }}</td>
              <td class="border border-border p-2 text-center">{{ item.level }}</td>
              <td class="border border-border p-2 text-sm" :title="item.availableAt ? absoluteTime(item.availableAt) : ''">
                <template v-if="item.availableAt">
                  <span>{{ relativeTime(item.availableAt) }}</span>
                  <span class="block text-xs text-muted">{{ absoluteTime(item.availableAt) }}</span>
                </template>
                <span v-else class="text-muted">{{ item.srsStage === 0 ? 'In lessons' : 'Burned' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="pageCount > 1" class="mt-3 flex items-center gap-3 text-sm">
          <AppButton :disabled="page === 1" @click="page--">← Previous</AppButton>
          <span class="text-muted">Page {{ page }} of {{ pageCount }}</span>
          <AppButton :disabled="page === pageCount" @click="page++">Next →</AppButton>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sortItems, useWanikaniSrsItems } from '../composables/useWanikaniSrsItems.js'
import AppButton from './AppButton.vue'

const SRS_STAGE_NAMES = [
  'Lessons',
  'Apprentice I',
  'Apprentice II',
  'Apprentice III',
  'Apprentice IV',
  'Guru I',
  'Guru II',
  'Master',
  'Enlightened',
  'Burned',
]

const route = useRoute()
const router = useRouter()

// The stage lives in the route (/wanikani-srs/:stage?) so picking one is a
// real navigation, same convention as the flashcard :scope routes.
const stage = computed(() => {
  const n = Number(route.params.stage)
  return route.params.stage && Number.isInteger(n) && n >= 0 && n < SRS_STAGE_NAMES.length ? n : null
})
const { items, total, status, error, reload } = useWanikaniSrsItems(stage)

const sort = ref('next-asc')
const sortedItems = computed(() => sortItems(items.value, sort.value))

// Display-only pagination over the fully loaded, fully sorted stage — the
// sort has to see every item first (WaniKani's API can't order by
// available_at), so this only limits how many rows render at once.
const PAGE_SIZE = 50
const page = ref(1)
const pageCount = computed(() => Math.max(1, Math.ceil(sortedItems.value.length / PAGE_SIZE)))
const pageItems = computed(() => sortedItems.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
// A new stage or sort order starts back at the first page.
watch([stage, sort], () => {
  page.value = 1
})

const summary = computed(() => {
  const now = Date.now()
  const dueNow = items.value.filter((i) => i.availableAt && Date.parse(i.availableAt) <= now).length
  const first = (page.value - 1) * PAGE_SIZE + 1
  const last = Math.min(page.value * PAGE_SIZE, items.value.length)
  return `${items.value.length} items · ${dueNow} available for review now · showing ${first}–${last}`
})

function selectStage(n) {
  router.push({ name: 'wanikani-srs', params: { stage: n } })
}

// Header click flips soonest ⇄ latest (or back to soonest from WaniKani order).
function toggleNextReviewSort() {
  sort.value = sort.value === 'next-asc' ? 'next-desc' : 'next-asc'
}

const TYPE_LABELS = { radical: 'Radical', kanji: 'Kanji', vocabulary: 'Vocabulary', kana_vocabulary: 'Kana vocabulary' }
// WaniKani's own colour coding per subject type.
const TYPE_CLASSES = {
  radical: 'bg-sky-500',
  kanji: 'bg-pink-500',
  vocabulary: 'bg-purple-600',
  kana_vocabulary: 'bg-purple-600',
}

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const RELATIVE_UNITS = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

function relativeTime(iso) {
  const diff = Date.parse(iso) - Date.now()
  if (diff <= 0) return 'Available now'
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (diff >= ms) return relativeFormat.format(Math.round(diff / ms), unit)
  }
  return relativeFormat.format(1, 'minute')
}

const absoluteFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function absoluteTime(iso) {
  return absoluteFormat.format(new Date(iso))
}
</script>
