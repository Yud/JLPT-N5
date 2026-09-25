<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-4">
      <label class="flex items-center gap-2 text-sm">
        Level
        <select
          class="rounded-md border border-border bg-surface px-2 py-1"
          :value="data?.level ?? ''"
          :disabled="!data"
          @change="selectLevel($event.target.value)"
        >
          <option v-for="n in levelOptions" :key="n" :value="n">
            {{ n }}{{ n === data?.userLevel ? ' (current)' : '' }}
          </option>
        </select>
      </label>

      <label class="flex items-center gap-2 text-sm">
        Sort
        <select v-model="sort" class="rounded-md border border-border bg-surface px-2 py-1">
          <option value="default">WaniKani order</option>
          <option value="next-asc">Next review — soonest first</option>
          <option value="next-desc">Next review — latest first</option>
        </select>
      </label>

      <AppButton :disabled="status === 'loading'" @click="reload">🔄 Refresh</AppButton>
    </div>

    <p v-if="status === 'error'" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

    <p v-else-if="status === 'loading' && !data" class="text-sm text-muted">Loading level…</p>

    <div v-else-if="data" class="w-full overflow-x-auto" :class="{ 'opacity-60': status === 'loading' }">
      <p class="mb-2 text-sm text-muted">{{ summary }}</p>
      <table class="w-full border-collapse">
        <thead>
          <tr>
            <th class="border border-border p-2 text-center font-semibold" scope="col">Item</th>
            <th class="border border-border p-2 text-left font-semibold" scope="col">Meaning</th>
            <th class="border border-border p-2 text-left font-semibold" scope="col">Reading</th>
            <th class="border border-border p-2 text-left font-semibold" scope="col">SRS</th>
            <th class="border border-border p-2 text-left font-semibold" scope="col">
              <button type="button" class="cursor-pointer hover:underline" @click="toggleNextReviewSort">
                Next review {{ sort === 'next-asc' ? '▲' : sort === 'next-desc' ? '▼' : '' }}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in sortedItems" :key="item.subjectId" class="hover:bg-surface-hover">
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
            <td class="border border-border p-2 text-sm">{{ srsLabel(item) }}</td>
            <td class="border border-border p-2 text-sm" :title="item.availableAt ? absoluteTime(item.availableAt) : ''">
              <template v-if="item.state === 'review' && item.availableAt">
                <span>{{ relativeTime(item.availableAt) }}</span>
                <span class="block text-xs text-muted">{{ absoluteTime(item.availableAt) }}</span>
              </template>
              <span v-else class="text-muted">{{ STATE_LABELS[item.state] }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sortItems, useWanikaniLevel } from '../composables/useWanikaniLevel.js'
import AppButton from './AppButton.vue'

const route = useRoute()
const router = useRouter()

// The level lives in the route (/wanikani-levels/:level?) so picking one is
// a real navigation, same convention as the flashcard :scope routes. No
// param means "your current level", resolved server-side.
const routeLevel = computed(() => (route.params.level ? Number(route.params.level) : null))
const { data, status, error, reload } = useWanikaniLevel(routeLevel)

const sort = ref('default')

const levelOptions = computed(() => Array.from({ length: data.value?.maxLevel ?? 0 }, (_, i) => i + 1))
const sortedItems = computed(() => sortItems(data.value?.items ?? [], sort.value))

const summary = computed(() => {
  const items = data.value.items
  const now = Date.now()
  const dueNow = items.filter((i) => i.state === 'review' && i.availableAt && Date.parse(i.availableAt) <= now).length
  const locked = items.filter((i) => i.state === 'locked').length
  return `${items.length} items · ${dueNow} available for review now · ${locked} locked`
})

function selectLevel(value) {
  router.push({ name: 'wanikani-levels', params: { level: value } })
}

// Header click cycles soonest → latest → back to WaniKani order.
function toggleNextReviewSort() {
  sort.value = { default: 'next-asc', 'next-asc': 'next-desc', 'next-desc': 'default' }[sort.value]
}

const TYPE_LABELS = { radical: 'Radical', kanji: 'Kanji', vocabulary: 'Vocabulary', kana_vocabulary: 'Kana vocabulary' }
// WaniKani's own colour coding per subject type.
const TYPE_CLASSES = {
  radical: 'bg-sky-500',
  kanji: 'bg-pink-500',
  vocabulary: 'bg-purple-600',
  kana_vocabulary: 'bg-purple-600',
}
const STATE_LABELS = { locked: 'Locked', lesson: 'In lessons', burned: 'Burned', review: '—' }
const SRS_STAGE_NAMES = [
  'Lesson',
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

function srsLabel(item) {
  if (item.srsStage === null) return '—'
  return SRS_STAGE_NAMES[item.srsStage] ?? `Stage ${item.srsStage}`
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
