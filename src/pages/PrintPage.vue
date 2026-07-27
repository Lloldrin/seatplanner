<script setup lang="ts">
import { ref } from 'vue'
import { usePlannerStore } from '../stores/planner'
import TableSeatMap from '../components/TableSeatMap.vue'

const store = usePlannerStore()

const layout = ref<'lists' | 'map'>('lists')

const today = new Date().toLocaleDateString(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

function print() {
  window.print()
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <div class="mb-6 flex flex-wrap items-center gap-3 print:hidden">
      <p class="text-sm text-stone-500">
        Print this page (or save it as a PDF) for the venue — the app chrome is hidden on paper.
      </p>
      <div class="ml-auto flex items-center gap-3">
        <div class="flex rounded-lg border border-stone-300 p-0.5 text-sm">
          <button
            class="rounded-md px-3 py-1 font-medium transition"
            :class="layout === 'lists' ? 'bg-stone-800 text-white' : 'text-stone-500 hover:text-stone-800'"
            @click="layout = 'lists'"
          >
            Lists
          </button>
          <button
            class="rounded-md px-3 py-1 font-medium transition"
            :class="layout === 'map' ? 'bg-stone-800 text-white' : 'text-stone-500 hover:text-stone-800'"
            @click="layout = 'map'"
          >
            Seat map
          </button>
        </div>
        <button
          class="rounded-lg bg-stone-800 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-stone-700"
          @click="print"
        >
          Print / Save as PDF
        </button>
      </div>
    </div>

    <h1 class="text-2xl font-semibold">Seating plan</h1>
    <p class="mt-1 text-sm text-stone-500">
      {{ today }} · {{ store.guests.length }} guests · {{ store.seatedCount }} seated ·
      {{ store.tables.length }} tables
    </p>

    <div class="mt-6 grid gap-6 sm:grid-cols-2 print:grid-cols-2">
      <section
        v-for="table in store.tables"
        :key="table.id"
        class="break-inside-avoid rounded-lg border border-stone-300 p-4"
      >
        <h2 class="font-semibold">
          {{ table.name }}
          <span class="text-sm font-normal text-stone-400">
            · {{ table.seats.filter(Boolean).length }}/{{ table.capacity }}
          </span>
        </h2>
        <TableSeatMap v-if="layout === 'map'" :table="table" class="mt-2 h-64 w-full" />
        <ol v-else class="mt-2 text-sm leading-6">
          <li v-for="(guest, index) in store.seatOccupants(table.id)" :key="index" class="flex gap-2">
            <span class="w-6 shrink-0 text-right tabular-nums text-stone-400">{{ index + 1 }}.</span>
            <span :class="guest ? '' : 'text-stone-300'">{{ guest?.name ?? '—' }}</span>
            <span v-if="guest?.notes" class="text-stone-400">({{ guest.notes }})</span>
          </li>
        </ol>
      </section>
    </div>

    <div
      v-if="layout === 'map' && store.groups.length"
      class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500"
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

    <section v-if="store.unassignedGuests.length" class="mt-6 rounded-lg border border-stone-300 p-4">
      <h2 class="font-semibold">
        Unseated <span class="text-sm font-normal text-stone-400">· {{ store.unassignedGuests.length }}</span>
      </h2>
      <p class="mt-2 text-sm leading-6">
        {{ store.unassignedGuests.map((g) => g.name).join(', ') }}
      </p>
    </section>
  </div>
</template>
