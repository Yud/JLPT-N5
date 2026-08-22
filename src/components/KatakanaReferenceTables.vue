<template>
  <div class="space-y-8">
    <KanaTable title="Base Katakana" :layout="TABLE_LAYOUTS.base" />
    <KanaTable title="Dakuten / Handakuten" :layout="TABLE_LAYOUTS.dakuten" />
    <KanaTable title="Combinations (Yōon)" :layout="TABLE_LAYOUTS.combination" speakable />
  </div>
</template>

<script setup>
import KanaTable from './KanaTable.vue'
import { TABLE_LAYOUTS } from '../data/katakana.js'
</script>
