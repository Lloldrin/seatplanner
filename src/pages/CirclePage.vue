<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { computed, ref } from 'vue'
import type { Guest, Table } from '../stores/planner'
import { GROUP_COLORS, usePlannerStore } from '../stores/planner'
import { slotAngle, useCircleDrag } from '../composables/useCircleDrag'
import { useSvgZoom } from '../composables/useSvgZoom'
import RuleWarnings from '../components/RuleWarnings.vue'

const store = usePlannerStore()

const showTables = useLocalStorage('seatplanner:circle-show-tables', true)

const svgEl = ref<SVGSVGElement | null>(null)
const { viewBox, zoomed, zoomCenter, reset, onWheel, onPanStart } = useSvgZoom(svgEl)

const search = ref('')
const matchedIds = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return null
  return new Set(store.guests.filter((g) => g.name.toLowerCase().includes(q)).map((g) => g.id))
})

const CX = 400
const CY = 400
const R_DOT = 300 // seat dots
const R_ARC = 272 // table arcs, inside the dot ring
const TAU = Math.PI * 2

interface Slot {
  key: string
  guest?: Guest
  table?: Table
}

// One slot per seat (seat numbers are positions, empty seats included, so
// table segments never move), then one slot per unseated guest at the end.
const slots = computed<Slot[]>(() => {
  const out: Slot[] = []
  for (const { table } of store.tableRanges) {
    table.seats.forEach((id, index) => {
      const guest = id ? store.guests.find((g) => g.id === id) : undefined
      out.push(guest ? { key: guest.id, guest, table } : { key: `${table.id}-seat-${index}`, table })
    })
  }
  for (const guest of store.unassignedGuests) out.push({ key: guest.id, guest })
  return out
})

const slotCount = computed(() => slots.value.length)

const { dragIndex, dropIndex, startDrag, displayAngle } = useCircleDrag(
  svgEl,
  slotCount,
  (fromSlot, toSlot) => {
    const guest = slots.value[fromSlot]?.guest
    if (!guest) return
    if (toSlot < store.totalSeats) {
      const range = store.tableRanges.find((r) => toSlot >= r.start && toSlot < r.end)
      if (range) store.assignGuest(guest.id, range.table.id, toSlot - range.start)
    } else {
      store.unseatToPosition(guest.id, toSlot - store.totalSeats)
    }
  },
)

const slotSpacing = computed(() => (slotCount.value ? TAU / slotCount.value : 0))
const halfSlot = computed(() => slotSpacing.value / 2)

// Seats carry initials only; the dot has to be big enough to hold two letters,
// and shrinks once the ring gets crowded.
const dotRadius = computed(() => (slotCount.value > 60 ? 7 : 9))
const initialsSize = computed(() => (slotCount.value > 60 ? 7 : 8.5))

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]!.toUpperCase())
    .join('')
}

/** Seat under the pointer, or the one being dragged. */
const activeIndex = ref<number | null>(null)

const revealedName = computed(() => {
  const index = dragIndex.value ?? activeIndex.value
  if (index === null) return ''
  return slots.value[index]?.guest?.name ?? ''
})

function onSeatPointerDown(index: number, event: PointerEvent) {
  if (!slots.value[index]?.guest) return
  activeIndex.value = index
  startDrag(index, event)
}

function polar(radius: number, angle: number): { x: number; y: number } {
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) }
}

const placed = computed(() =>
  slots.value.map((slot, index) => {
    const angle = displayAngle(index)
    const point = polar(R_DOT, angle)
    const flipped = Math.cos(angle) < -0.001
    const deg = (angle * 180) / Math.PI + (flipped ? 180 : 0)
    return { slot, index, point, deg, flipped }
  }),
)

function tableColor(table: Table): string {
  const index = store.tables.findIndex((t) => t.id === table.id)
  return GROUP_COLORS[index % GROUP_COLORS.length]!
}

interface Run {
  key: string
  color: string
  title: string
  counter: string
  start: number
  length: number
}

// Static segments: every table always spans its full capacity in slots;
// unseated guests form a gray segment at the end.
const runs = computed<Run[]>(() => {
  if (!store.tables.length) return []
  const out: Run[] = store.tableRanges.map((range) => ({
    key: range.table.id,
    color: tableColor(range.table),
    title: range.table.name,
    counter: `${range.table.seats.filter(Boolean).length}/${range.table.capacity}`,
    start: range.start,
    length: range.table.capacity,
  }))
  const unseated = store.unassignedGuests.length
  if (unseated > 0) {
    out.push({
      key: 'unseated',
      color: 'var(--color-neutral-600)',
      title: 'Unseated',
      counter: `${unseated}`,
      start: store.totalSeats,
      length: unseated,
    })
  }
  return out
})

// Divider before slot c marks a segment starting there; c = 0 wraps around.
const boundaries = computed(() => {
  if (slotCount.value < 2 || !store.tables.length) return []
  return [...new Set(runs.value.map((run) => run.start))]
})

function runArc(run: Run): string {
  const n = slotCount.value
  const gap = Math.min(0.03, halfSlot.value * 0.4)
  const from = slotAngle(run.start, n) - halfSlot.value + gap
  const to = slotAngle(run.start, n) + (run.length - 1) * slotSpacing.value + halfSlot.value - gap
  const a = polar(R_ARC, from)
  const b = polar(R_ARC, to)
  const large = to - from > Math.PI ? 1 : 0
  return `M ${a.x} ${a.y} A ${R_ARC} ${R_ARC} 0 ${large} 1 ${b.x} ${b.y}`
}

function runLabelPoint(run: Run): { x: number; y: number } {
  const mid = slotAngle(run.start, slotCount.value) + ((run.length - 1) * slotSpacing.value) / 2
  return polar(R_ARC - 52, mid)
}

function boundaryLine(cut: number): { a: { x: number; y: number }; b: { x: number; y: number } } {
  const angle = slotAngle(cut, slotCount.value) - halfSlot.value
  return { a: polar(R_ARC - 18, angle), b: polar(R_DOT - 8, angle) }
}

const dropPoint = computed(() =>
  dropIndex.value === null ? null : polar(R_DOT, slotAngle(dropIndex.value, slotCount.value)),
)
</script>

<template>
  <div class="flex flex-col items-center">
    <p v-if="!slotCount" class="text-muted mt-12 text-center">
      Add some guests first — then arrange them around the circle here.
    </p>

    <template v-else>
      <RuleWarnings class="max-w-3xl" />
      <div class="flex w-full max-w-3xl flex-wrap items-center gap-2">
        <input
          v-model="search"
          type="search"
          placeholder="Find a guest…"
          class="input w-44"
        />
        <div class="flex items-center gap-1">
          <button class="btn btn-secondary px-2.5 py-1" title="Zoom in" @click="zoomCenter(1 / 1.4)">+</button>
          <button class="btn btn-secondary px-2.5 py-1" title="Zoom out" @click="zoomCenter(1.4)">−</button>
          <button v-if="zoomed" class="btn btn-secondary px-2.5 py-1 text-xs" @click="reset">Reset</button>
        </div>
        <button
          v-if="store.tables.length"
          class="btn ml-auto px-3 py-1 text-xs"
          :class="showTables ? 'btn-primary' : 'btn-secondary'"
          @click="showTables = !showTables"
        >
          {{ showTables ? 'Tables shown' : 'Tables hidden' }}
        </button>
      </div>
      <svg
        ref="svgEl"
        :viewBox="viewBox"
        class="max-h-[80vh] w-full max-w-3xl touch-none select-none"
        :class="{ 'cursor-move': zoomed }"
        @wheel.prevent="onWheel"
        @pointerdown="onPanStart"
      >
        <!-- table segment arcs -->
        <g v-if="showTables">
        <g v-for="run in runs" :key="run.key">
          <circle
            v-if="run.length === slotCount"
            :cx="CX"
            :cy="CY"
            :r="R_ARC"
            fill="none"
            :stroke="run.color"
            stroke-opacity="0.3"
            stroke-width="7"
          />
          <path
            v-else
            :d="runArc(run)"
            fill="none"
            :stroke="run.color"
            stroke-opacity="0.3"
            stroke-width="7"
            stroke-linecap="round"
          />
          <text
            :x="runLabelPoint(run).x"
            :y="runLabelPoint(run).y"
            text-anchor="middle"
            :fill="run.color"
          >
            <tspan :x="runLabelPoint(run).x" dy="-2" font-size="12" font-weight="600">
              {{ run.title }}
            </tspan>
            <tspan :x="runLabelPoint(run).x" dy="14" font-size="10" fill-opacity="0.75">
              {{ run.counter }}
            </tspan>
          </text>
        </g>

        <!-- dividers between segments -->
        <line
          v-for="index in boundaries"
          :key="`boundary-${index}`"
          :x1="boundaryLine(index).a.x"
          :y1="boundaryLine(index).a.y"
          :x2="boundaryLine(index).b.x"
          :y2="boundaryLine(index).b.y"
          stroke="var(--color-text)"
          stroke-width="1"
          stroke-linecap="round"
        />
        </g>

        <!-- drop target indicator -->
        <circle
          v-if="dropPoint"
          :cx="dropPoint.x"
          :cy="dropPoint.y"
          r="10"
          fill="none"
          stroke="var(--color-accent)"
          stroke-width="2"
        />

        <!-- seats -->
        <g
          v-for="item in placed"
          :key="item.slot.key"
          :style="{
            transform: `translate(${item.point.x}px, ${item.point.y}px) rotate(${item.deg}deg)`,
            transition: dragIndex === item.index ? 'none' : 'transform 150ms ease',
          }"
          :class="item.slot.guest ? 'cursor-grab' : ''"
          :opacity="matchedIds && item.slot.guest && !matchedIds.has(item.slot.guest.id) ? 0.2 : 1"
          @pointerdown.prevent.stop="onSeatPointerDown(item.index, $event)"
          @mouseenter="activeIndex = item.index"
          @mouseleave="activeIndex = null"
        >
          <title v-if="item.slot.guest">{{ item.slot.guest.name }}</title>
          <circle
            v-if="item.slot.guest && matchedIds?.has(item.slot.guest.id)"
            :r="dotRadius + 4"
            fill="none"
            stroke="var(--color-accent)"
            stroke-width="2"
          />
          <circle
            v-if="item.slot.guest"
            :r="dotRadius"
            :fill="store.groupColor(item.slot.guest.group) ?? 'var(--color-neutral-400)'"
            :stroke="dragIndex === item.index ? 'var(--color-text)' : 'var(--color-bg)'"
            stroke-width="1.5"
          />
          <circle v-else r="4" fill="var(--color-bg)" stroke="var(--color-divider)" stroke-width="1.5" />
          <!-- Counter-rotated so initials stay upright wherever the seat sits. -->
          <text
            v-if="item.slot.guest"
            :transform="`rotate(${-item.deg})`"
            text-anchor="middle"
            dominant-baseline="central"
            :font-size="initialsSize"
            class="circle-initials"
          >
            {{ initials(item.slot.guest.name) }}
          </text>
        </g>

        <text
          v-if="revealedName"
          :x="CX"
          :y="CY"
          text-anchor="middle"
          dominant-baseline="central"
          class="circle-center-name"
        >
          {{ revealedName }}
        </text>
        <text
          v-else
          :x="CX"
          :y="CY"
          text-anchor="middle"
          dominant-baseline="central"
          fill="var(--color-neutral-400)"
          font-size="15"
        >
          {{ store.guests.length }} guests
        </text>
      </svg>

      <div v-if="store.groups.length" class="mt-2 flex flex-wrap justify-center gap-3">
        <span
          v-for="group in store.groups"
          :key="group"
          class="text-muted inline-flex items-center gap-1.5 text-xs"
        >
          <span class="size-2 rounded-full" :style="{ backgroundColor: store.groupColor(group) }" />
          {{ group }}
        </span>
      </div>
      <p class="text-muted mt-1 text-xs">
        Drag a name onto a hollow dot to take that seat, or onto another guest to swap seats.
      </p>
    </template>
  </div>
</template>
