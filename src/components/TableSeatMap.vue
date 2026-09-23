<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Table } from '../stores/planner'
import { usePlannerStore } from '../stores/planner'
import { tableLayout, type SeatPos } from '../tableGeometry'

const props = withDefaults(
  defineProps<{
    table: Table
    /** Currently held guest (highlighted); enables the interactive affordances. */
    selectedGuestId?: string | null
    /**
     * When true, seats carry drag/keyboard hooks and rule violations are ringed.
     * Interaction itself is handled by the parent via event delegation on the
     * seat `data-*` attributes, so this component stays presentational.
     */
    interactive?: boolean
    /** Interactive only: show angled full-name labels beside seats instead of initials. */
    names?: boolean
  }>(),
  { selectedGuestId: null, interactive: false, names: false },
)

const store = usePlannerStore()

/** Print always labels seats with names; interactive maps only when `names` is on. */
const showLabels = computed(() => !props.interactive || props.names)

/** Seat-centre to label start: clears the larger interactive dot and its held/violation ring. */
const labelGap = computed(() => (props.interactive ? 16 : 12))

/** Rough rendered width (px) of the longest printed name, so the viewBox leaves room for it. */
const labelWidth = computed(() => {
  if (!showLabels.value) return 0
  const longest = Math.max(0, ...props.table.seats.map((id) => (id ? shortName(id).length : 0)))
  return longest * 6.2 + labelGap.value - 12 // ~average glyph width at the 11px label size
})

const layout = computed(() => tableLayout(props.table, labelWidth.value))
const round = computed(() => (layout.value.outline.kind === 'round' ? layout.value.outline : null))
const rect = computed(() => (layout.value.outline.kind === 'rect' ? layout.value.outline : null))

function name(guestId: string): string {
  return store.guests.find((g) => g.id === guestId)?.name ?? ''
}

/** Names over 15 characters are cut with an ellipsis; the full name lives in <title>. */
function shortName(guestId: string): string {
  const full = name(guestId)
  return full.length > 15 ? `${full.slice(0, 15).trimEnd()}…` : full
}

/** Interactive seats carry initials only; the full name shows in the table middle. */
function initials(guestId: string): string {
  return name(guestId)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]!.toUpperCase())
    .join('')
}

/** Seat under the pointer, keyboard focus, or a touch press. */
const activeSeatIndex = ref<number | null>(null)

const centerName = computed(() => {
  if (activeSeatIndex.value === null) return ''
  const id = props.table.seats[activeSeatIndex.value]
  return id ? name(id) : ''
})

/**
 * Given names on one line, surname on the next. A single-line "Margaret
 * Hamilton" is wider than a small square table and would run over its seats.
 */
const centerLines = computed(() => {
  const parts = centerName.value.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return parts
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]!]
})

const center = computed(() =>
  rect.value ? { x: rect.value.x + rect.value.w / 2, y: rect.value.y + rect.value.h / 2 } : { x: 0, y: 0 },
)

function seatLabel(table: Table, index: number): string {
  const id = table.seats[index]
  return id ? `Seat ${index + 1}: ${name(id)}` : `Seat ${index + 1}: empty`
}

function seatFill(guestId: string): string {
  const guest = store.guests.find((g) => g.id === guestId)
  return store.groupColor(guest?.group) ?? 'var(--color-neutral-400)'
}

/**
 * Side-label name placement. Top/bottom names run on a 45° diagonal (top ones
 * rising away from the seat, bottom ones ending at it) so neighbours don't
 * collide; round-table names point outward along the radius.
 */
function labelProps(seat: SeatPos): { x: number; transform?: string; 'text-anchor': string } {
  const gap = labelGap.value
  switch (seat.side) {
    case 'left':
      return { x: -gap, 'text-anchor': 'end' }
    case 'right':
      return { x: gap, 'text-anchor': 'start' }
    case 'top':
      return { x: gap, transform: 'rotate(-45)', 'text-anchor': 'start' }
    case 'bottom':
      return { x: -gap, transform: 'rotate(-45)', 'text-anchor': 'end' }
    case 'round': {
      const deg = (seat.angle * 180) / Math.PI + (seat.flipped ? 180 : 0)
      return { x: seat.flipped ? -gap : gap, transform: `rotate(${deg})`, 'text-anchor': seat.flipped ? 'end' : 'start' }
    }
  }
}
</script>

<template>
  <svg :viewBox="layout.viewBox" class="touch-none select-none">
    <!-- table surface -->
    <circle v-if="round" cx="0" cy="0" :r="round.r" class="table-body" />
    <rect
      v-else-if="rect"
      :x="rect.x"
      :y="rect.y"
      :width="rect.w"
      :height="rect.h"
      rx="4"
      class="table-body"
    />

    <!-- full name of the hovered / focused / pressed seat, shown in the middle -->
    <text
      v-if="interactive && centerLines.length"
      :x="center.x"
      :y="center.y"
      text-anchor="middle"
      dominant-baseline="central"
      class="seat-center-name"
    >
      <tspan
        v-for="(line, i) in centerLines"
        :key="i"
        :x="center.x"
        :dy="i === 0 ? (centerLines.length > 1 ? '-0.55em' : '0') : '1.1em'"
      >
        {{ line }}
      </tspan>
    </text>

    <!-- seats -->
    <g
      v-for="seat in layout.seats"
      :key="seat.index"
      :transform="`translate(${seat.x} ${seat.y})`"
      :class="interactive ? 'cursor-pointer focus:outline-none' : ''"
      :data-seat="interactive ? '' : undefined"
      :data-table-id="interactive ? table.id : undefined"
      :data-seat-index="interactive ? seat.index : undefined"
      :tabindex="interactive ? 0 : undefined"
      :role="interactive ? 'button' : undefined"
      :aria-label="interactive ? seatLabel(table, seat.index) : undefined"
      @mouseenter="interactive && (activeSeatIndex = seat.index)"
      @mouseleave="interactive && (activeSeatIndex = null)"
      @focusin="interactive && (activeSeatIndex = seat.index)"
      @focusout="interactive && (activeSeatIndex = null)"
      @pointerdown="interactive && (activeSeatIndex = seat.index)"
    >
      <title>{{ seatLabel(table, seat.index) }}</title>

      <!-- enlarged, always-hittable target for clicking/dropping and focus ring -->
      <circle
        v-if="interactive"
        r="15"
        fill="none"
        pointer-events="all"
        class="focus-visible:stroke-[var(--color-accent)]"
      />

      <template v-if="table.seats[seat.index]">
        <!-- held guest, and rule breaks, are both marked with an accent ring -->
        <circle
          v-if="selectedGuestId === table.seats[seat.index]"
          r="12"
          fill="none"
          stroke="var(--color-accent)"
          stroke-width="1.5"
        />
        <circle
          v-else-if="interactive && store.violatingGuestIds.has(table.seats[seat.index]!)"
          r="12"
          fill="none"
          stroke="var(--color-accent-600)"
          stroke-width="1"
          stroke-dasharray="2 2"
        />
        <circle
          :r="interactive ? 10 : 8"
          class="seat-ring"
          :style="{ '--seat-color': seatFill(table.seats[seat.index]!) }"
        />
        <!-- Initials mode: initials in the dot, full name revealed in the middle.
             Names mode (and print, which can't hover) labels each seat directly. -->
        <text
          v-if="!showLabels"
          text-anchor="middle"
          dominant-baseline="central"
          class="seat-initials"
        >
          {{ initials(table.seats[seat.index]!) }}
        </text>
        <text
          v-else
          v-bind="labelProps(seat)"
          dominant-baseline="central"
          class="seat-label"
        >
          {{ shortName(table.seats[seat.index]!) }}
        </text>
      </template>
      <template v-else>
        <circle
          r="8"
          class="seat-empty"
          :stroke="interactive && selectedGuestId ? 'var(--color-accent)' : undefined"
        />
        <text
          text-anchor="middle"
          dominant-baseline="central"
          class="seat-index"
          :fill="interactive && selectedGuestId ? 'var(--color-accent-700)' : undefined"
        >
          {{ seat.index + 1 }}
        </text>
      </template>
    </g>
  </svg>
</template>
