<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Table } from '../stores/planner'
import { usePlannerStore } from '../stores/planner'
import GuestChip from '../components/GuestChip.vue'
import RuleWarnings from '../components/RuleWarnings.vue'
import TableSeatMap from '../components/TableSeatMap.vue'
import TableShapeControl from '../components/TableShapeControl.vue'

const store = usePlannerStore()

const search = ref('')
const selectedGuestId = ref<string | null>(null)

const unassignedList = computed(() =>
  store.unassignedGuests.filter((g) =>
    g.name.toLowerCase().includes(search.value.trim().toLowerCase()),
  ),
)

function toggleSelect(guestId: string) {
  selectedGuestId.value = selectedGuestId.value === guestId ? null : guestId
}

function onSeatClick(table: Table, seatIndex: number) {
  const occupantId = table.seats[seatIndex] ?? null
  const selected = selectedGuestId.value
  if (selected) {
    // Clicking a guest's own seat with them held picks them off the table.
    if (occupantId === selected) store.unseatGuest(selected)
    else store.assignGuest(selected, table.id, seatIndex) // places, swapping any occupant
    selectedGuestId.value = null
  } else if (occupantId) {
    toggleSelect(occupantId)
  }
}
</script>

<template>
  <div>
    <p v-if="!store.tables.length" class="mt-12 text-center text-stone-400">
      No tables yet — add some on the <RouterLink to="/tables" class="underline">Tables</RouterLink> tab,
      then come back to seat people around them.
    </p>

    <template v-else>
      <RuleWarnings />

      <div class="mt-3 flex flex-col gap-4 lg:flex-row">
        <aside class="lg:w-64 lg:shrink-0">
          <div class="rounded-xl border border-stone-200 bg-white p-3">
            <h2 class="text-sm font-semibold">
              Unseated
              <span class="font-normal text-stone-400">· {{ store.unassignedGuests.length }}</span>
            </h2>
            <input
              v-model="search"
              type="search"
              placeholder="Search…"
              class="mt-2 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm focus:border-stone-400 focus:outline-none"
            />
            <p v-if="!store.guests.length" class="mt-3 text-sm text-stone-400">
              Add guests on the Guests tab first.
            </p>
            <p v-else-if="!store.unassignedGuests.length" class="mt-3 text-sm text-emerald-600">
              Everyone has a seat 🎉
            </p>
            <div class="mt-2 flex min-h-24 flex-wrap content-start gap-1.5">
              <GuestChip
                v-for="guest in unassignedList"
                :key="guest.id"
                :guest="guest"
                class="cursor-pointer"
                :class="{ '!border-emerald-500 ring-1 ring-emerald-300': selectedGuestId === guest.id }"
                @click="toggleSelect(guest.id)"
              />
            </div>
            <p class="mt-2 text-xs text-stone-400">
              Click a guest, then a seat to place them. Click an occupied seat to pick that guest up;
              click their own seat again to unseat. Set each table's shape in its header.
            </p>
          </div>
        </aside>

        <div class="grid flex-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          <div
            v-for="table in store.tables"
            :key="table.id"
            class="flex flex-col rounded-xl border bg-white p-3 shadow-sm transition"
            :class="selectedGuestId ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-stone-200'"
          >
            <div class="flex items-center gap-2">
              <input
                :value="table.name"
                class="w-0 min-w-0 flex-1 rounded px-1 py-0.5 text-sm font-semibold focus:bg-stone-50 focus:outline-none"
                @change="store.updateTable(table.id, { name: ($event.target as HTMLInputElement).value })"
              />
              <span
                class="text-xs tabular-nums"
                :class="table.seats.filter(Boolean).length >= table.capacity ? 'text-emerald-600' : 'text-stone-400'"
              >
                {{ table.seats.filter(Boolean).length }}/{{ table.capacity }}
              </span>
            </div>
            <TableShapeControl :table="table" class="mt-1.5" />

            <TableSeatMap
              :table="table"
              :selected-guest-id="selectedGuestId"
              interactive
              class="mt-2 h-64 w-full"
              @seat-click="onSeatClick(table, $event)"
            />
          </div>
        </div>
      </div>

      <div v-if="store.groups.length" class="mt-3 flex flex-wrap justify-center gap-3">
        <span
          v-for="group in store.groups"
          :key="group"
          class="inline-flex items-center gap-1.5 text-xs text-stone-500"
        >
          <span class="size-2 rounded-full" :style="{ backgroundColor: store.groupColor(group) }" />
          {{ group }}
        </span>
      </div>
    </template>
  </div>
</template>
