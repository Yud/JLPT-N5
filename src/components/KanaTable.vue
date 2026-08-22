<template>
  <section>
    <h3 class="mb-2 text-lg leading-tight font-semibold">{{ title }}</h3>
    <div class="w-full overflow-x-auto">
      <table class="w-full border-collapse">
        <thead>
          <tr>
            <th class="h-11 min-w-11 border border-border p-1 sm:h-14 sm:min-w-14" scope="col"></th>
            <th
              v-for="column in layout.columns"
              :key="column"
              class="h-11 min-w-11 border border-border p-1 text-center font-semibold sm:h-14 sm:min-w-14"
              scope="col"
            >
              {{ column }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in layout.rows" :key="row.row" class="hover:bg-surface-hover">
            <th
              class="h-11 min-w-11 border border-border p-1 text-center font-semibold sm:h-14 sm:min-w-14"
              scope="row"
            >
              {{ row.label }}
            </th>
            <td
              v-for="(cell, index) in row.cells"
              :key="index"
              class="h-11 min-w-11 border border-border p-1 text-center sm:h-14 sm:min-w-14"
            >
              <div v-if="cell" class="flex flex-col items-center justify-center">
                <span class="flex items-center gap-0.5">
                  <span class="text-[1.75rem]">{{ cell.kana }}</span>
                  <UPopover v-if="PHONETIC_NOTES[cell.id]">
                    <button
                      type="button"
                      class="cursor-pointer self-start text-xs text-muted transition-colors hover:text-text"
                      aria-label="Pronunciation note"
                    >
                      ⓘ
                    </button>
                    <template #content>
                      <p class="max-w-xs p-3 text-sm">{{ PHONETIC_NOTES[cell.id] }}</p>
                    </template>
                  </UPopover>
                </span>
                <span class="text-[0.9rem] text-muted">{{ cell.romaji }}</span>
                <button
                  v-if="speakable"
                  type="button"
                  class="cursor-pointer rounded-full p-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-text"
                  aria-label="Play pronunciation"
                  @click="speak(cell.kana)"
                >
                  🔊
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { useSpeech } from '../composables/useSpeech.js'
import { PHONETIC_NOTES } from '../data/phonetics.js'

defineProps({
  title: { type: String, required: true },
  // { columns: string[], rows: { row, label, cells: (HiraganaCharacter|null)[] }[] }
  layout: { type: Object, required: true },
  // Shows a speaker button per cell. Reserved for the combinations (yōon)
  // tables — base/dakuten rows are single kana the learner already has
  // memorized cold by this point, so a button on every one of those cells
  // would just be noise; the digraphs are the ones worth hearing.
  speakable: { type: Boolean, default: false },
})

const { speak } = useSpeech()
</script>
