<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Table, TableShapeKind } from '../stores/planner'
import { usePlannerStore } from '../stores/planner'

const props = defineProps<{ table: Table }>()
const store = usePlannerStore()

const kind = computed<TableShapeKind>(() => props.table.shape?.kind ?? 'round')
const sidesText = ref('')

// Keep the sides field mirrored to the table (e.g. after undo or a capacity change).
watch(
  () => props.table.shape,
  (shape) => {
    if (shape?.sides) sidesText.value = shape.sides.join(', ')
  },
  { immediate: true, deep: true },
)

function changeKind(event: Event) {
  const next = (event.target as HTMLSelectElement).value as TableShapeKind
  store.setTableShape(props.table.id, next)
}

function applySides() {
  const nums = sidesText.value.split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n))
  if (!nums.length) return
  if (!store.setTableShape(props.table.id, 'rectangle', nums)) {
    alert('That would remove seats that already have guests — unseat them first, or use larger sides.')
    if (props.table.shape?.sides) sidesText.value = props.table.shape.sides.join(', ')
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 text-xs text-stone-500">
    <label class="flex items-center gap-1">
      Shape
      <select
        :value="kind"
        class="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-xs"
        @change="changeKind"
      >
        <option value="round">Round</option>
        <option value="square">Square</option>
        <option value="rectangle">Rectangle</option>
      </select>
    </label>
    <label v-if="kind === 'rectangle'" class="flex items-center gap-1">
      Seats per side
      <input
        v-model="sidesText"
        type="text"
        placeholder="6, 2"
        title="e.g. “6, 2” = 6 on long sides, 2 on short. Or “6, 0, 6, 2” for top, right, bottom, left."
        class="w-24 rounded border border-stone-200 px-1.5 py-0.5 text-xs"
        @change="applySides"
        @keydown.enter.prevent="applySides"
      />
    </label>
  </div>
</template>
