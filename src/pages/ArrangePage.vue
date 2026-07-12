<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePlannerStore } from '../stores/planner'
import { useCircleReorder } from '../composables/useCircleDrag'

const store = usePlannerStore()
const router = useRouter()

const svgEl = ref<SVGSVGElement | null>(null)
const count = computed(() => store.guests.length)

const { dragIndex, startDrag, displayAngle } = useCircleReorder(svgEl, count, (from, to) =>
  store.moveGuest(from, to),
)

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
      'This replaces the current seating.',
  )
  if (!accepted) return
  store.assignAllInOrder()
  router.push('/circle')
}
</script>

<template>
  <div class="flex flex-col items-center">
    <p v-if="!count" class="mt-12 text-center text-stone-400">
      Add some guests first — then arrange them around the circle here.
    </p>

    <template v-else>
      <div class="flex w-full max-w-3xl items-center justify-between gap-3">
        <p class="text-sm text-stone-500">
          Arrange freely — who sits next to whom. No tables yet, just the order.
        </p>
        <button
          class="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!store.tables.length"
          :title="store.tables.length ? 'Turn this order into seat assignments' : 'Add tables first on the Tables tab'"
          @click="assignAll"
        >
          Assign to tables
        </button>
      </div>

      <svg
        ref="svgEl"
        viewBox="0 0 800 800"
        class="max-h-[80vh] w-full max-w-3xl touch-none select-none"
      >
        <g
          v-for="item in placed"
          :key="item.guest.id"
          :style="{
            transform: `translate(${item.point.x}px, ${item.point.y}px) rotate(${item.deg}deg)`,
            transition: dragIndex === item.index ? 'none' : 'transform 150ms ease',
          }"
          class="cursor-grab"
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
