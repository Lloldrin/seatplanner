<script setup lang="ts">
import { usePlannerStore } from '../stores/planner'

const store = usePlannerStore()
</script>

<template>
  <div
    v-if="store.violations.length"
    class="mb-3 w-full rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent-100)] px-3 py-2 text-[13px] text-[var(--color-accent-800)]"
  >
    <p v-for="violation in store.violations" :key="violation.rule.id" class="mb-0">
      ⚠ {{ violation.message }}
    </p>
  </div>
</template>
