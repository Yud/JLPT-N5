<template>
  <div class="space-y-8">
    <CounterTable title="Days of the Month (1–10)" :items="DAY_COUNTERS" />
    <CounterTable title="Counting Things — つ (1–10)" :items="THING_COUNTERS" />
  </div>
</template>

<script setup>
import CounterTable from './CounterTable.vue'
import { DAY_COUNTERS, THING_COUNTERS } from '../data/kanji.js'
</script>
