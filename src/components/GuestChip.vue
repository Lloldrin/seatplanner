<script setup lang="ts">
import type { Guest } from '../stores/planner'
import { usePlannerStore } from '../stores/planner'

const props = defineProps<{ guest: Guest }>()

const store = usePlannerStore()
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-divider)] px-2 py-1 text-[13px]"
    :title="props.guest.notes"
  >
    <span
      v-if="props.guest.group"
      class="size-2 shrink-0 rounded-full"
      :style="{ backgroundColor: store.groupColor(props.guest.group) }"
    />
    {{ props.guest.name }}
    <slot />
  </span>
</template>
