<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePlannerStore } from '../stores/planner'
import { useCircleReorder } from '../composables/useCircleDrag'
import { useSvgZoom } from '../composables/useSvgZoom'

const store = usePlannerStore()
const router = useRouter()

const svgEl = ref<SVGSVGElement | null>(null)
const count = computed(() => store.guests.length)

const { dragIndex, startDrag, displayAngle } = useCircleReorder(svgEl, count, (from, to) =>
  store.moveGuest(from, to),
)
const { viewBox, zoomed, zoomCenter, reset, onWheel, onPanStart } = useSvgZoom(svgEl)

const search = ref('')
const matchedIds = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return null
  return new Set(store.guests.filter((g) => g.name.toLowerCase().includes(q)).map((g) => g.id))
})

const coupleCount = computed(() => store.rules.filter((r) => r.kind === 'couple').length)

const CX = 400
const CY = 400
const R_DOT = 300

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

function assignAll() {
  const accepted = confirm(
    `Seat all ${count.value} guests in this order — Table 1 fills first, then Table 2, …? ` +
      'This replaces the current seating (a backup is kept under Backups).',
  )
  if (!accepted) return
  store.assignAllInOrder()
  router.push('/circle')
}
</script>

<template>
  <div class="flex flex-col items-center">
    <p v-if="!count" class="text-muted mt-12 text-center">
      Add some guests first — then arrange them around the circle here.
    </p>

    <template v-else>
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
          v-if="coupleCount"
          class="btn btn-secondary px-3 py-1 text-xs"
          title="Pull each couple's partners next to each other in the order"
          @click="store.snapCouplesAdjacent()"
        >
          Snap couples together
        </button>
        <button
          class="btn btn-primary ml-auto"
          :disabled="!store.tables.length"
          :title="store.tables.length ? 'Turn this order into seat assignments' : 'Add tables first on the Tables tab'"
          @click="assignAll"
        >
          Assign to tables
        </button>
      </div>
      <p class="text-muted mt-1 w-full max-w-3xl text-xs">
        Arrange freely — who sits next to whom. No tables yet, just the order.
      </p>

      <svg
        ref="svgEl"
        :viewBox="viewBox"
        class="max-h-[80vh] w-full max-w-3xl touch-none select-none"
        :class="{ 'cursor-move': zoomed }"
        @wheel.prevent="onWheel"
        @pointerdown="onPanStart"
      >
        <g
          v-for="item in placed"
          :key="item.guest.id"
          :style="{
            transform: `translate(${item.point.x}px, ${item.point.y}px) rotate(${item.deg}deg)`,
            transition: dragIndex === item.index ? 'none' : 'transform 150ms ease',
          }"
          class="cursor-grab"
          :opacity="matchedIds && !matchedIds.has(item.guest.id) ? 0.2 : 1"
          @pointerdown.prevent.stop="startDrag(item.index, $event)"
        >
          <circle
            v-if="matchedIds?.has(item.guest.id)"
            r="9"
            fill="none"
            stroke="var(--color-accent)"
            stroke-width="2"
          />
          <circle
            r="5"
            :fill="store.groupColor(item.guest.group) ?? 'var(--color-neutral-400)'"
            :stroke="dragIndex === item.index ? 'var(--color-text)' : 'var(--color-bg)'"
            stroke-width="1.5"
          />
          <text
            :x="item.flipped ? -12 : 12"
            :text-anchor="item.flipped ? 'end' : 'start'"
            dominant-baseline="central"
            :font-size="labelSize"
            :font-weight="dragIndex === item.index || matchedIds?.has(item.guest.id) ? 600 : 400"
            :fill="matchedIds?.has(item.guest.id) ? 'var(--color-accent-700)' : 'var(--color-text)'"
          >
            {{ item.guest.name }}
          </text>
        </g>

        <text
          :x="CX"
          :y="CY"
          text-anchor="middle"
          dominant-baseline="central"
          fill="var(--color-neutral-400)"
          font-size="15"
        >
          {{ count }} guests
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
      <p class="text-muted mt-1 text-xs">Drag a name around the circle to reorder.</p>
    </template>
  </div>
</template>
