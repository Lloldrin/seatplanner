<script setup lang="ts">
import { usePlannerStore } from '../stores/planner'

const store = usePlannerStore()
</script>

<template>
  <div
    v-if="store.violations.length"
    class="mb-3 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
  >
    <p v-for="violation in store.violations" :key="violation.rule.id">
      ⚠ {{ violation.message }}
    </p>
  </div>
</template>
