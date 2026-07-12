<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Table } from '../stores/planner'
import { usePlannerStore } from '../stores/planner'
import GuestChip from '../components/GuestChip.vue'
import TableCard from '../components/TableCard.vue'

const store = usePlannerStore()

const newCount = ref(2)
const newSize = ref(8)
const search = ref('')
const selectedGuestId = ref<string | null>(null)

function addTables() {
  if (newCount.value >= 1 && newSize.value >= 1) {
    store.addTables(Math.floor(newCount.value), Math.floor(newSize.value))
  }
}

const unassignedList = computed(() =>
  store.unassignedGuests.filter((g) =>
    g.name.toLowerCase().includes(search.value.trim().toLowerCase()),
  ),
)

const seatBalance = computed(() => store.totalSeats - store.guests.length)

function toggleSelect(guestId: string) {
  selectedGuestId.value = selectedGuestId.value === guestId ? null : guestId
}

function onSeatClick(table: Table, seatIndex: number) {
  const occupantId = table.seats[seatIndex] ?? null
  if (selectedGuestId.value && selectedGuestId.value !== occupantId) {
    // Place the selected guest here; an occupant swaps into their old spot.
    store.assignGuest(selectedGuestId.value, table.id, seatIndex)
    selectedGuestId.value = null
  } else if (occupantId) {
    toggleSelect(occupantId)
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-3">
      <form class="flex items-center gap-2 text-sm" @submit.prevent="addTables">
        Add
        <input
          v-model.number="newCount"
          type="number"
          min="1"
          class="w-14 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-center"
        />
        table(s) of
        <input
          v-model.number="newSize"
          type="number"
          min="1"
          class="w-14 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-center"
        />
        seats
        <button
          type="submit"
          class="rounded-lg bg-stone-800 px-4 py-1.5 font-medium text-white transition hover:bg-stone-700"
        >
          Add
        </button>
      </form>
      <p
        v-if="store.tables.length && store.guests.length"
        class="ml-auto text-sm"
        :class="seatBalance < 0 ? 'text-amber-600' : 'text-emerald-600'"
      >
        {{ store.guests.length }} guests, {{ store.totalSeats }} seats
        <template v-if="seatBalance < 0"> — {{ -seatBalance }} short</template>
        <template v-else-if="seatBalance > 0"> — {{ seatBalance }} spare</template>
      </p>
    </div>

    <p v-if="!store.tables.length" class="mt-12 text-center text-stone-400">
      No tables yet — add some above, e.g. “2 tables of 8”.
    </p>

    <div v-else class="mt-4 flex flex-col gap-4 lg:flex-row">
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
            Click a guest, then a seat to place them. Clicking an occupied seat swaps the two
            guests; ✕ unseats. Seats never shift on their own.
          </p>
        </div>
      </aside>

      <div class="grid flex-1 auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <TableCard
          v-for="table in store.tables"
          :key="table.id"
          :table="table"
          :selected-guest-id="selectedGuestId"
          @seat-click="onSeatClick(table, $event)"
        />
      </div>
    </div>
  </div>
</template>
