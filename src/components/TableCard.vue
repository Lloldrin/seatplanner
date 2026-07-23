<script setup lang="ts">
import { computed } from 'vue'
import type { Table } from '../stores/planner'
import { usePlannerStore } from '../stores/planner'
import GuestChip from './GuestChip.vue'
import TableShapeControl from './TableShapeControl.vue'

const props = defineProps<{ table: Table; selectedGuestId: string | null }>()
const emit = defineEmits<{ seatClick: [seatIndex: number] }>()

const store = usePlannerStore()

const occupants = computed(() => store.seatOccupants(props.table.id))
const occupiedCount = computed(() => occupants.value.filter(Boolean).length)
const isFull = computed(() => occupiedCount.value >= props.table.capacity)

function confirmRemove() {
  if (
    !occupiedCount.value ||
    confirm(`Remove ${props.table.name}? Its ${occupiedCount.value} guests become unseated.`)
  ) {
    store.removeTable(props.table.id)
  }
}
</script>

<template>
  <div
    class="flex flex-col rounded-xl border bg-white p-3 shadow-sm transition"
    :class="selectedGuestId ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-stone-200'"
  >
    <div class="flex items-center gap-2">
      <input
        :value="table.name"
        class="w-0 min-w-0 flex-1 rounded px-1 py-0.5 text-sm font-semibold focus:bg-stone-50 focus:outline-none"
        @change="store.updateTable(table.id, { name: ($event.target as HTMLInputElement).value })"
      />
      <label
        v-if="table.shape?.kind !== 'rectangle'"
        class="flex items-center gap-1 text-xs text-stone-400"
      >
        seats
        <input
          :value="table.capacity"
          type="number"
          min="1"
          class="w-12 rounded border border-stone-200 px-1 py-0.5 text-center text-xs"
          @change="store.updateTable(table.id, { capacity: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
      <span v-else class="text-xs text-stone-400">{{ table.capacity }} seats</span>
      <button
        class="rounded px-1 text-stone-300 transition hover:text-red-500"
        title="Remove table"
        @click="confirmRemove"
      >
        ✕
      </button>
    </div>

    <TableShapeControl :table="table" class="mt-2" />

    <div class="mt-2 flex items-center gap-2">
      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
        <div
          class="h-full rounded-full transition-all"
          :class="isFull ? 'bg-emerald-500' : 'bg-stone-400'"
          :style="{ width: `${Math.min(100, (occupiedCount / table.capacity) * 100)}%` }"
        />
      </div>
      <span class="text-xs tabular-nums" :class="isFull ? 'text-emerald-600' : 'text-stone-400'">
        {{ occupiedCount }}/{{ table.capacity }}
      </span>
    </div>

    <div class="mt-2 flex min-h-16 flex-1 flex-wrap content-start gap-1.5 rounded-lg bg-stone-50 p-2">
      <template v-for="(guest, index) in occupants" :key="guest?.id ?? `${table.id}-${index}`">
        <GuestChip
          v-if="guest"
          :guest="guest"
          class="cursor-pointer"
          :class="{
            '!border-emerald-500 ring-1 ring-emerald-300': selectedGuestId === guest.id,
            '!border-amber-400 ring-1 ring-amber-300':
              selectedGuestId !== guest.id && store.violatingGuestIds.has(guest.id),
          }"
          @click="emit('seatClick', index)"
        >
          <button
            class="text-stone-300 transition hover:text-red-500"
            title="Unseat"
            @click.stop="store.unseatGuest(guest.id)"
          >
            ✕
          </button>
        </GuestChip>
        <button
          v-else
          class="inline-flex min-w-8 items-center justify-center rounded-full border border-dashed px-2 py-1 text-xs transition"
          :class="selectedGuestId ? 'border-emerald-400 text-emerald-600 hover:bg-emerald-50' : 'border-stone-300 text-stone-300'"
          :title="`Seat ${index + 1} — empty`"
          @click="emit('seatClick', index)"
        >
          {{ index + 1 }}
        </button>
      </template>
    </div>
  </div>
</template>
