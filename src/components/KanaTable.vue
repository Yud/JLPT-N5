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
                <span class="text-[1.75rem]">{{ cell.kana }}</span>
                <span class="text-[0.9rem] text-muted">{{ cell.romaji }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  // { columns: string[], rows: { row, label, cells: (HiraganaCharacter|null)[] }[] }
  layout: { type: Object, required: true },
})
</script>
