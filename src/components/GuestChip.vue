<script setup lang="ts">
import type { Guest } from '../stores/planner'
import { usePlannerStore } from '../stores/planner'

const props = defineProps<{ guest: Guest }>()

const store = usePlannerStore()
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-sm shadow-sm"
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
