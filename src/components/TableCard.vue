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
  <div class="card gap-0" :class="{ 'is-held': selectedGuestId }">
    <div class="flex items-center gap-2">
      <input
        :value="table.name"
        class="card-title w-0 min-w-0 flex-1 border-0 bg-transparent px-1 py-0.5"
        @change="store.updateTable(table.id, { name: ($event.target as HTMLInputElement).value })"
      />
      <label
        v-if="table.shape?.kind !== 'rectangle'"
        class="text-muted flex items-center gap-1 text-xs"
      >
        seats
        <input
          :value="table.capacity"
          type="number"
          min="1"
          class="input tnum w-12 min-h-0 px-1 py-0.5 text-center text-xs"
          @change="store.updateTable(table.id, { capacity: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
      <span v-else class="text-muted text-xs">{{ table.capacity }} seats</span>
      <button
        class="btn btn-ghost px-1 py-0"
        title="Remove table"
        @click="confirmRemove"
      >
        ✕
      </button>
    </div>

    <TableShapeControl :table="table" class="mt-2" />

    <!-- Fill is drawn as a rule, not a filled bar — colour stays stroke here. -->
    <div class="mt-2 flex items-center gap-2">
      <div class="h-px flex-1 bg-[var(--color-divider)]">
        <div
          class="h-px transition-all"
          :class="isFull ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-neutral-500)]'"
          :style="{ width: `${Math.min(100, (occupiedCount / table.capacity) * 100)}%` }"
        />
      </div>
      <span
        class="tnum text-xs"
        :class="isFull ? 'text-[var(--color-accent-700)]' : 'text-muted'"
      >
        {{ occupiedCount }}/{{ table.capacity }}
      </span>
    </div>

    <div class="mt-2 flex min-h-16 flex-1 flex-wrap content-start gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-2">
      <template v-for="(guest, index) in occupants" :key="guest?.id ?? `${table.id}-${index}`">
        <GuestChip
          v-if="guest"
          :guest="guest"
          class="cursor-pointer bg-[var(--color-bg)]"
          :class="{
            'is-held': selectedGuestId === guest.id,
            'is-violating': selectedGuestId !== guest.id && store.violatingGuestIds.has(guest.id),
          }"
          @click="emit('seatClick', index)"
        >
          <button
            class="btn btn-ghost px-0.5 py-0 text-xs"
            title="Unseat"
            @click.stop="store.unseatGuest(guest.id)"
          >
            ✕
          </button>
        </GuestChip>
        <button
          v-else
          class="tnum inline-flex min-w-8 items-center justify-center rounded-[var(--radius-md)] border border-dashed px-2 py-1 text-xs transition"
          :class="
            selectedGuestId
              ? 'border-[var(--color-accent)] text-[var(--color-accent-700)] hover:bg-[var(--color-accent-100)]'
              : 'text-muted border-[var(--color-divider)]'
          "
          :title="`Seat ${index + 1} — empty`"
          @click="emit('seatClick', index)"
        >
          {{ index + 1 }}
        </button>
      </template>
    </div>
  </div>
</template>
