<script setup lang="ts">
import { toPng } from 'html-to-image'
import { ref } from 'vue'
import { usePlannerStore } from '../stores/planner'
import TableSeatMap from '../components/TableSeatMap.vue'
import { isLongTable } from '../tableGeometry'

const store = usePlannerStore()

const layout = ref<'lists' | 'map'>('lists')
/** Each table on its own sheet: page breaks in print, one column on screen. */
const onePerPage = ref(false)
/** Group-coloured seat dots on the map; off prints names only (saves ink). */
const dots = ref(true)

const today = new Date().toLocaleDateString(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

function print() {
  window.print()
}

// --- PNG export ---------------------------------------------------------------

const sheet = ref<HTMLElement | null>(null)
const exporting = ref(false)

const PNG_MARGIN = 24

const SVG_STYLE_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-feature-settings',
  'letter-spacing',
]

/**
 * html-to-image copies an <svg> wholesale without resolving the CSS on its
 * children, so class-driven fills and fonts vanish. Pin each child's computed
 * values inline for the capture (a visual no-op) and hand back an undo.
 */
function pinSvgStyles(root: HTMLElement): () => void {
  const saved: [Element, string | null][] = []
  for (const el of root.querySelectorAll<SVGElement>('svg *')) {
    const computed = getComputedStyle(el)
    saved.push([el, el.getAttribute('style')])
    for (const prop of SVG_STYLE_PROPS) el.style.setProperty(prop, computed.getPropertyValue(prop))
  }
  return () => {
    for (const [el, style] of saved) {
      if (style === null) el.removeAttribute('style')
      else el.setAttribute('style', style)
    }
  }
}

/** Rasterise `node` (skipping anything marked data-png-skip) and download it. */
async function downloadPng(node: HTMLElement, name: string) {
  exporting.value = true
  const unpin = pinSvgStyles(node)
  try {
    const url = await toPng(node, {
      pixelRatio: 2,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      width: node.offsetWidth + PNG_MARGIN * 2,
      height: node.offsetHeight + PNG_MARGIN * 2,
      style: { margin: `${PNG_MARGIN}px` },
      filter: (el) => !(el instanceof Element && el.hasAttribute('data-png-skip')),
    })
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.png`
    a.click()
  } catch {
    alert('Could not create the image — please try again.')
  } finally {
    unpin()
    exporting.value = false
  }
}

function fileSlug(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'table'
}

function downloadAll() {
  if (sheet.value) void downloadPng(sheet.value, `seating-plan-${new Date().toISOString().slice(0, 10)}`)
}

function downloadTable(event: MouseEvent, tableName: string) {
  const section = (event.currentTarget as Element).closest('section')
  if (section instanceof HTMLElement) void downloadPng(section, `seating-plan-${fileSlug(tableName)}`)
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <div class="mb-6 flex flex-col gap-3 print:hidden">
      <div class="flex flex-wrap items-center gap-3">
        <p class="text-muted mb-0 text-[13px]">
          Print this page (or save it as a PDF) for the venue — the app chrome is hidden on paper.
        </p>
        <div class="ml-auto flex items-center gap-3">
          <div class="seg">
            <label class="seg-opt">
              <input v-model="layout" type="radio" value="lists" />
              Lists
            </label>
            <label class="seg-opt">
              <input v-model="layout" type="radio" value="map" />
              Seat map
            </label>
          </div>
          <button class="btn btn-primary" @click="print">Print / Save as PDF</button>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-3">
        <div class="seg" aria-label="Pages">
          <label class="seg-opt">
            <input v-model="onePerPage" type="radio" :value="false" />
            All tables
          </label>
          <label class="seg-opt">
            <input v-model="onePerPage" type="radio" :value="true" />
            One per page
          </label>
        </div>
        <template v-if="layout === 'map'">
          <div class="seg" aria-label="Seat dots">
            <label class="seg-opt">
              <input v-model="dots" type="radio" :value="true" />
              Colored dots
            </label>
            <label class="seg-opt">
              <input v-model="dots" type="radio" :value="false" />
              Names only
            </label>
          </div>
          <button class="btn btn-secondary" :disabled="exporting" @click="downloadAll">
            Download PNG
          </button>
        </template>
      </div>
    </div>

    <div ref="sheet">
      <!-- Display size takes the normal cut, per the system's type rules. -->
      <h1 class="font-normal">Seating plan</h1>
      <p class="text-muted tnum mt-1 text-[13px]">
        {{ today }} · {{ store.guests.length }} guests · {{ store.seatedCount }} seated ·
        {{ store.tables.length }} tables
      </p>

      <hr class="hr" />

      <div class="mt-6 grid gap-6" :class="onePerPage ? '' : 'sm:grid-cols-2 print:grid-cols-2'">
        <section
          v-for="(table, index) in store.tables"
          :key="table.id"
          class="break-inside-avoid"
          :class="{
            'col-span-full': layout === 'map' && isLongTable(table),
            'print:break-before-page': onePerPage && index > 0,
          }"
        >
          <div class="flex items-center gap-2">
            <h2 class="card-title mb-0">
              {{ table.name }}
              <span class="text-muted tnum">
                · {{ table.seats.filter(Boolean).length }}/{{ table.capacity }}
              </span>
            </h2>
            <button
              v-if="layout === 'map'"
              data-png-skip
              class="btn btn-ghost ml-auto text-xs print:hidden"
              :disabled="exporting"
              :aria-label="`Download ${table.name} as PNG`"
              @click="downloadTable($event, table.name)"
            >
              PNG
            </button>
          </div>
          <TableSeatMap
            v-if="layout === 'map'"
            :table="table"
            :dots="dots"
            class="mt-2 w-full"
            :class="
              isLongTable(table)
                ? 'h-auto'
                : onePerPage
                  ? 'mx-auto block h-auto max-h-[75vh] max-w-xl'
                  : 'h-64'
            "
          />
          <ol v-else class="mt-2 list-none p-0 text-[13px] leading-6">
            <li v-for="(guest, index) in store.seatOccupants(table.id)" :key="index" class="flex gap-2">
              <span class="tnum text-muted w-6 shrink-0 text-right">{{ index + 1 }}.</span>
              <span :class="guest ? '' : 'text-muted'">{{ guest?.name ?? '—' }}</span>
              <span v-if="guest?.notes" class="text-muted italic">({{ guest.notes }})</span>
            </li>
          </ol>

          <!-- One per page: every sheet (and single-table PNG) carries its own key. -->
          <div
            v-if="layout === 'map' && dots && onePerPage && store.groups.length"
            class="text-muted mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px]"
          >
            <span v-for="group in store.groups" :key="group" class="inline-flex items-center gap-1.5">
              <span class="size-2.5 rounded-full" :style="{ backgroundColor: store.groupColor(group) }" />
              {{ group }}
            </span>
          </div>
        </section>
      </div>

      <div
        v-if="layout === 'map' && dots && !onePerPage && store.groups.length"
        class="text-muted mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px]"
      >
        <span
          v-for="group in store.groups"
          :key="group"
          class="inline-flex items-center gap-1.5"
        >
          <span class="size-2.5 rounded-full" :style="{ backgroundColor: store.groupColor(group) }" />
          {{ group }}
        </span>
      </div>

      <template v-if="store.unassignedGuests.length">
        <hr class="hr" :class="{ 'print:break-before-page': onePerPage }" />
        <section>
          <h2 class="card-title mb-0">
            Unseated <span class="text-muted tnum">· {{ store.unassignedGuests.length }}</span>
          </h2>
          <p class="mt-2 text-[13px] leading-6">
            {{ store.unassignedGuests.map((g) => g.name).join(', ') }}
          </p>
        </section>
      </template>
    </div>
  </div>
</template>
