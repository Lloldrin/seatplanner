<script setup lang="ts">
import { computed } from 'vue'
import type { Table } from '../stores/planner'
import { usePlannerStore } from '../stores/planner'
import { tableLayout } from '../tableGeometry'

const props = withDefaults(
  defineProps<{
    table: Table
    /** Currently held guest (highlighted); enables the interactive affordances. */
    selectedGuestId?: string | null
    /** When true, seats are clickable and rule violations are ringed. */
    interactive?: boolean
  }>(),
  { selectedGuestId: null, interactive: false },
)

const emit = defineEmits<{ seatClick: [seatIndex: number] }>()

const store = usePlannerStore()

const layout = computed(() => tableLayout(props.table))
const round = computed(() => (layout.value.outline.kind === 'round' ? layout.value.outline : null))
const rect = computed(() => (layout.value.outline.kind === 'rect' ? layout.value.outline : null))

function name(guestId: string): string {
  return store.guests.find((g) => g.id === guestId)?.name ?? ''
}

function seatFill(guestId: string): string {
  const guest = store.guests.find((g) => g.id === guestId)
  return store.groupColor(guest?.group) ?? '#a8a29e'
}

function labelDx(side: string, flipped: boolean): number {
  if (side === 'left') return -13
  if (side === 'right') return 13
  if (side === 'round') return flipped ? -13 : 13
  return 0 // top / bottom centred
}

function labelDy(side: string): number {
  if (side === 'top') return -15
  if (side === 'bottom') return 21
  return 0
}

function labelAnchor(side: string, flipped: boolean): string {
  if (side === 'left') return 'end'
  if (side === 'right') return 'start'
  if (side === 'round') return flipped ? 'end' : 'start'
  return 'middle'
}
</script>

<template>
  <svg :viewBox="layout.viewBox" class="touch-none select-none">
    <!-- table surface -->
    <circle v-if="round" cx="0" cy="0" :r="round.r" fill="#f5f5f4" stroke="#e7e5e4" stroke-width="2" />
    <rect
      v-else-if="rect"
      :x="rect.x"
      :y="rect.y"
      :width="rect.w"
      :height="rect.h"
      rx="10"
      fill="#f5f5f4"
      stroke="#e7e5e4"
      stroke-width="2"
    />

    <!-- seats -->
    <g
      v-for="seat in layout.seats"
      :key="seat.index"
      :transform="`translate(${seat.x} ${seat.y})`"
      :class="interactive ? 'cursor-pointer' : ''"
      @click="interactive && emit('seatClick', seat.index)"
    >
      <template v-if="table.seats[seat.index]">
        <circle
          v-if="selectedGuestId === table.seats[seat.index]"
          r="12"
          fill="none"
          stroke="#059669"
          stroke-width="2"
        />
        <circle
          r="8"
          :fill="seatFill(table.seats[seat.index]!)"
          :stroke="interactive && store.violatingGuestIds.has(table.seats[seat.index]!) ? '#f59e0b' : 'white'"
          :stroke-width="interactive && store.violatingGuestIds.has(table.seats[seat.index]!) ? 2.5 : 1.5"
        />
        <text
          :dx="labelDx(seat.side, seat.flipped)"
          :dy="labelDy(seat.side)"
          :text-anchor="labelAnchor(seat.side, seat.flipped)"
          dominant-baseline="central"
          font-size="11"
          fill="#44403c"
        >
          {{ name(table.seats[seat.index]!) }}
        </text>
      </template>
      <template v-else>
        <circle
          r="8"
          fill="white"
          :stroke="interactive && selectedGuestId ? '#34d399' : '#d6d3d1'"
          stroke-width="1.5"
          stroke-dasharray="3 2"
        />
        <text
          text-anchor="middle"
          dominant-baseline="central"
          font-size="8"
          :fill="interactive && selectedGuestId ? '#059669' : '#a8a29e'"
        >
          {{ seat.index + 1 }}
        </text>
      </template>
    </g>
  </svg>
</template>
