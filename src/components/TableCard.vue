<script setup lang="ts">
import { computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { Guest, Table } from '../stores/planner'
import { usePlannerStore } from '../stores/planner'
import GuestChip from './GuestChip.vue'

const props = defineProps<{ table: Table; selectedGuestId: string | null }>()
const emit = defineEmits<{ seatSelected: [] }>()

const store = usePlannerStore()

const seated = computed<Guest[]>({
  get: () => store.tableGuests(props.table.id),
  set: (list) =>
    store.reconcileTableList(
      props.table.id,
      list.map((g) => g.id),
    ),
})

const isFull = computed(() => seated.value.length >= props.table.capacity)

function seatSelectedGuest() {
  if (!props.selectedGuestId) return
  if (store.assignGuest(props.selectedGuestId, props.table.id)) emit('seatSelected')
}

function confirmRemove() {
  if (
    !seated.value.length ||
    confirm(`Remove ${props.table.name}? Its guests shift into the following tables.`)
  ) {
    store.removeTable(props.table.id)
  }
}
</script>

<template>
  <div
    class="flex flex-col rounded-xl border bg-white p-3 shadow-sm transition"
    :class="selectedGuestId ? 'cursor-pointer border-emerald-400 ring-1 ring-emerald-200' : 'border-stone-200'"
    @click="seatSelectedGuest"
  >
    <div class="flex items-center gap-2">
      <input
        :value="table.name"
        class="w-0 min-w-0 flex-1 rounded px-1 py-0.5 text-sm font-semibold focus:bg-stone-50 focus:outline-none"
        @click.stop
        @change="store.updateTable(table.id, { name: ($event.target as HTMLInputElement).value })"
      />
      <label class="flex items-center gap-1 text-xs text-stone-400" @click.stop>
        seats
        <input
          :value="table.capacity"
          type="number"
          min="1"
          class="w-12 rounded border border-stone-200 px-1 py-0.5 text-center text-xs"
          @change="store.updateTable(table.id, { capacity: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
      <button
        class="rounded px-1 text-stone-300 transition hover:text-red-500"
        title="Remove table"
        @click.stop="confirmRemove"
      >
        ✕
      </button>
    </div>

    <div class="mt-2 flex items-center gap-2">
      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
        <div
          class="h-full rounded-full transition-all"
          :class="isFull ? 'bg-emerald-500' : 'bg-stone-400'"
          :style="{ width: `${Math.min(100, (seated.length / table.capacity) * 100)}%` }"
        />
      </div>
      <span class="text-xs tabular-nums" :class="isFull ? 'text-emerald-600' : 'text-stone-400'">
        {{ seated.length }}/{{ table.capacity }}
      </span>
    </div>

    <VueDraggable
      v-model="seated"
      group="guests"
      :animation="150"
      class="mt-2 flex min-h-16 flex-1 flex-wrap content-start gap-1.5 rounded-lg bg-stone-50 p-2"
    >
      <GuestChip v-for="guest in seated" :key="guest.id" :guest="guest" class="cursor-grab">
        <button
          class="text-stone-300 transition hover:text-red-500"
          title="Unseat"
          @click.stop="store.unseatGuest(guest.id)"
        >
          ✕
        </button>
      </GuestChip>
    </VueDraggable>
  </div>
</template>
