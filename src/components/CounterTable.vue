<template>
  <section>
    <h3 class="mb-2 text-lg leading-tight font-semibold">{{ title }}</h3>
    <div class="w-full overflow-x-auto">
      <table class="w-full border-collapse">
        <thead>
          <tr>
            <th class="h-11 min-w-11 border border-border p-1 text-center font-semibold sm:h-14 sm:min-w-14" scope="col">#</th>
            <th class="h-11 min-w-20 border border-border p-1 text-center font-semibold sm:h-14 sm:min-w-24" scope="col">Kanji</th>
            <th class="h-11 min-w-20 border border-border p-1 text-center font-semibold sm:h-14 sm:min-w-24" scope="col">Reading</th>
            <th class="h-11 min-w-20 border border-border p-1 text-center font-semibold sm:h-14 sm:min-w-24" scope="col">Romaji</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" class="hover:bg-surface-hover">
            <th class="h-11 min-w-11 border border-border p-1 text-center font-semibold sm:h-14 sm:min-w-14" scope="row">
              {{ item.number }}
            </th>
            <td class="h-11 border border-border p-1 sm:h-14">
              <span class="flex items-center justify-center gap-0.5">
                <span class="text-xl">{{ item.kanji }}</span>
                <UPopover v-if="item.note">
                  <button
                    type="button"
                    class="cursor-pointer self-start text-xs text-muted transition-colors hover:text-text"
                    aria-label="Reading note"
                  >
                    ⓘ
                  </button>
                  <template #content>
                    <p class="max-w-xs p-3 text-sm">{{ item.note }}</p>
                  </template>
                </UPopover>
                <button
                  type="button"
                  class="cursor-pointer rounded-full p-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-text"
                  aria-label="Play pronunciation"
                  @click="speak(item.kanji)"
                >
                  🔊
                </button>
              </span>
            </td>
            <td class="h-11 border border-border p-1 text-center sm:h-14">{{ item.reading }}</td>
            <td class="h-11 border border-border p-1 text-center text-muted sm:h-14">{{ item.romaji }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { useSpeech } from '../composables/useSpeech.js'

defineProps({
  title: { type: String, required: true },
  // { id, number, kanji, reading, romaji, note? }[]
  items: { type: Array, required: true },
})

const { speak } = useSpeech()
</script>
