<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { computed, ref } from 'vue'
import type { Table } from '../stores/planner'
import { GROUP_COLORS, usePlannerStore } from '../stores/planner'
import { slotAngle, useCircleDrag } from '../composables/useCircleDrag'

const store = usePlannerStore()

const showTables = useLocalStorage('seatplanner:circle-show-tables', true)

const svgEl = ref<SVGSVGElement | null>(null)
const count = computed(() => store.guests.length)
const { dragIndex, startDrag, displayAngle } = useCircleDrag(svgEl, count, (from, to) =>
  store.moveGuest(from, to),
)

const CX = 400
const CY = 400
const R_DOT = 300 // guest dots
const R_ARC = 272 // table arcs, inside the dot ring
const TAU = Math.PI * 2

const slotSpacing = computed(() => (count.value ? TAU / count.value : 0))
const halfSlot = computed(() => slotSpacing.value / 2)
const labelSize = computed(() => (count.value > 60 ? 10 : count.value > 40 ? 11 : 13))

function polar(radius: number, angle: number): { x: number; y: number } {
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) }
}

const placed = computed(() =>
  store.guests.map((guest, index) => {
    const angle = displayAngle(index)
    const point = polar(R_DOT, angle)
    const flipped = Math.cos(angle) < -0.001
    const deg = (angle * 180) / Math.PI + (flipped ? 180 : 0)
    return { guest, index, point, deg, flipped }
  }),
)

interface Run {
  table: Table
  start: number
  length: number
}

// Tables claim fixed consecutive ranges of the circle; arcs cover the guests
// currently inside each range and stay put while guests move through them.
const runs = computed<Run[]>(() => {
  const n = count.value
  if (!n) return []
  return store.tableRanges
    .filter((range) => range.start < n)
    .map((range) => ({
      table: range.table,
      start: range.start,
      length: Math.min(range.end, n) - range.start,
    }))
})

// Cut positions: a divider before guest c marks a table starting (or seating
// ending) there. c = 0 wraps around to sit between the last and first guest.
const boundaries = computed(() => {
  const n = count.value
  if (n < 2 || !store.tables.length) return []
  const cuts = new Set<number>()
  for (const range of store.tableRanges) {
    if (range.start < n) cuts.add(range.start)
  }
  if (store.totalSeats < n) cuts.add(store.totalSeats)
  return [...cuts]
})

function tableColor(table: Table): string {
  const index = store.tables.findIndex((t) => t.id === table.id)
  return GROUP_COLORS[index % GROUP_COLORS.length]!
}

function runArc(run: Run): string {
  const n = count.value
  const gap = Math.min(0.03, halfSlot.value * 0.4)
  const from = slotAngle(run.start, n) - halfSlot.value + gap
  const to = slotAngle(run.start, n) + (run.length - 1) * slotSpacing.value + halfSlot.value - gap
  const a = polar(R_ARC, from)
  const b = polar(R_ARC, to)
  const large = to - from > Math.PI ? 1 : 0
  return `M ${a.x} ${a.y} A ${R_ARC} ${R_ARC} 0 ${large} 1 ${b.x} ${b.y}`
}

function runLabelPoint(run: Run): { x: number; y: number } {
  const mid = slotAngle(run.start, count.value) + ((run.length - 1) * slotSpacing.value) / 2
  return polar(R_ARC - 52, mid)
}

function boundaryLine(cut: number): { a: { x: number; y: number }; b: { x: number; y: number } } {
  const angle = slotAngle(cut, count.value) - halfSlot.value
  return { a: polar(R_ARC - 18, angle), b: polar(R_DOT - 8, angle) }
}
</script>

<template>
  <div class="flex flex-col items-center">
    <p v-if="!count" class="mt-12 text-center text-stone-400">
      Add some guests first — then arrange them around the circle here.
    </p>

    <template v-else>
      <div v-if="store.tables.length" class="flex w-full max-w-3xl justify-end">
        <button
          class="rounded-full border px-3 py-1 text-xs font-medium transition"
          :class="showTables ? 'border-stone-700 bg-stone-800 text-white' : 'border-stone-300 text-stone-500 hover:bg-stone-100'"
          @click="showTables = !showTables"
        >
          {{ showTables ? 'Tables shown' : 'Tables hidden' }}
        </button>
      </div>
      <svg
        ref="svgEl"
        viewBox="0 0 800 800"
        class="max-h-[80vh] w-full max-w-3xl touch-none select-none"
      >
        <!-- table segment arcs -->
        <g v-if="showTables">
        <g v-for="run in runs" :key="`${run.table.id}-${run.start}`">
          <circle
            v-if="run.length === count"
            :cx="CX"
            :cy="CY"
            :r="R_ARC"
            fill="none"
            :stroke="tableColor(run.table)"
            stroke-opacity="0.3"
            stroke-width="7"
          />
          <path
            v-else
            :d="runArc(run)"
            fill="none"
            :stroke="tableColor(run.table)"
            stroke-opacity="0.3"
            stroke-width="7"
            stroke-linecap="round"
          />
          <text
            :x="runLabelPoint(run).x"
            :y="runLabelPoint(run).y"
            text-anchor="middle"
            :fill="tableColor(run.table)"
          >
            <tspan :x="runLabelPoint(run).x" dy="-2" font-size="12" font-weight="600">
              {{ run.table.name }}
            </tspan>
            <tspan :x="runLabelPoint(run).x" dy="14" font-size="10" fill-opacity="0.75">
              {{ run.length }}/{{ run.table.capacity }}
            </tspan>
          </text>
        </g>

        <!-- dividers where adjacent guests belong to different tables -->
        <line
          v-for="index in boundaries"
          :key="`boundary-${index}`"
          :x1="boundaryLine(index).a.x"
          :y1="boundaryLine(index).a.y"
          :x2="boundaryLine(index).b.x"
          :y2="boundaryLine(index).b.y"
          stroke="white"
          stroke-width="6"
          stroke-linecap="round"
          class="drop-shadow-[0_0_1px_rgba(0,0,0,0.6)]"
        />
        </g>

        <!-- guests -->
        <g
          v-for="item in placed"
          :key="item.guest.id"
          :style="{
            transform: `translate(${item.point.x}px, ${item.point.y}px) rotate(${item.deg}deg)`,
            transition: dragIndex === item.index ? 'none' : 'transform 150ms ease',
          }"
          class="cursor-grab"
          :class="{ 'cursor-grabbing': dragIndex === item.index }"
          @pointerdown.prevent="startDrag(item.index, $event)"
        >
          <circle
            r="5"
            :fill="store.groupColor(item.guest.group) ?? '#a8a29e'"
            :stroke="dragIndex === item.index ? '#292524' : 'white'"
            stroke-width="1.5"
          />
          <text
            :x="item.flipped ? -12 : 12"
            :text-anchor="item.flipped ? 'end' : 'start'"
            dominant-baseline="central"
            :font-size="labelSize"
            :font-weight="dragIndex === item.index ? 700 : 400"
            fill="#44403c"
          >
            {{ item.guest.name }}
          </text>
        </g>

        <text
          :x="CX"
          :y="CY"
          text-anchor="middle"
          dominant-baseline="central"
          fill="#a8a29e"
          font-size="15"
        >
          {{ count }} guests
        </text>
      </svg>

      <div v-if="store.groups.length" class="mt-2 flex flex-wrap justify-center gap-3">
        <span
          v-for="group in store.groups"
          :key="group"
          class="inline-flex items-center gap-1.5 text-xs text-stone-500"
        >
          <span class="size-2 rounded-full" :style="{ backgroundColor: store.groupColor(group) }" />
          {{ group }}
        </span>
      </div>
      <p class="mt-1 text-xs text-stone-400">Drag a name around the circle to reorder.</p>
    </template>
  </div>
</template>
