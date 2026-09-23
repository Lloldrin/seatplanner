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

    <!-- Display size takes the normal cut, per the system's type rules. -->
    <h1 class="font-normal">Seating plan</h1>
    <p class="text-muted tnum mt-1 text-[13px]">
      {{ today }} · {{ store.guests.length }} guests · {{ store.seatedCount }} seated ·
      {{ store.tables.length }} tables
    </p>

    <hr class="hr" />

    <div class="mt-6 grid gap-6 sm:grid-cols-2 print:grid-cols-2">
      <section
        v-for="table in store.tables"
        :key="table.id"
        class="break-inside-avoid"
      >
        <h2 class="card-title mb-0">
          {{ table.name }}
          <span class="text-muted tnum">
            · {{ table.seats.filter(Boolean).length }}/{{ table.capacity }}
          </span>
        </h2>
        <TableSeatMap v-if="layout === 'map'" :table="table" class="mt-2 h-64 w-full" />
        <ol v-else class="mt-2 list-none p-0 text-[13px] leading-6">
          <li v-for="(guest, index) in store.seatOccupants(table.id)" :key="index" class="flex gap-2">
            <span class="tnum text-muted w-6 shrink-0 text-right">{{ index + 1 }}.</span>
            <span :class="guest ? '' : 'text-muted'">{{ guest?.name ?? '—' }}</span>
            <span v-if="guest?.notes" class="text-muted italic">({{ guest.notes }})</span>
          </li>
        </ol>
      </section>
    </div>

    <div
      v-if="layout === 'map' && store.groups.length"
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
      <hr class="hr" />
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
</template>
