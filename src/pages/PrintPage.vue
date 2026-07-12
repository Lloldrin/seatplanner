<script setup lang="ts">
import { usePlannerStore } from '../stores/planner'

const store = usePlannerStore()

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
    <div class="mb-6 flex items-center justify-between print:hidden">
      <p class="text-sm text-stone-500">
        Print this page (or save it as a PDF) for the venue — the app chrome is hidden on paper.
      </p>
      <button
        class="rounded-lg bg-stone-800 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-stone-700"
        @click="print"
      >
        Print / Save as PDF
      </button>
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
        <ol class="mt-2 text-sm leading-6">
          <li v-for="(guest, index) in store.seatOccupants(table.id)" :key="index" class="flex gap-2">
            <span class="w-6 shrink-0 text-right tabular-nums text-stone-400">{{ index + 1 }}.</span>
            <span :class="guest ? '' : 'text-stone-300'">{{ guest?.name ?? '—' }}</span>
            <span v-if="guest?.notes" class="text-stone-400">({{ guest.notes }})</span>
          </li>
        </ol>
      </section>
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
