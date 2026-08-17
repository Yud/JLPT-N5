<template>
  <div class="space-y-8">
    <section v-for="category in categories" :key="category.id">
      <h3 class="mb-2 text-lg leading-tight font-semibold">{{ category.label }}</h3>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        <VocabCard v-for="word in getWordsForCategory(category.id)" :key="word.id" :word="word" />
      </div>
    </section>
  </div>
</template>

<script setup>
import VocabCard from './VocabCard.vue'
import { getVocabCategories, getWordsForCategory } from '../data/words.js'

const categories = getVocabCategories().filter((c) => c.kind !== 'all')
</script>
