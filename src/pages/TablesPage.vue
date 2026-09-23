<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Table } from '../stores/planner'
import { usePlannerStore } from '../stores/planner'
import GuestChip from '../components/GuestChip.vue'
import RuleWarnings from '../components/RuleWarnings.vue'
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
          class="input tnum w-14 text-center"
        />
        table(s) of
        <input
          v-model.number="newSize"
          type="number"
          min="1"
          class="input tnum w-14 text-center"
        />
        seats
        <button type="submit" class="btn btn-primary">Add</button>
      </form>
      <p
        v-if="store.tables.length && store.guests.length"
        class="tnum mb-0 ml-auto text-[13px]"
        :class="seatBalance < 0 ? 'text-[var(--color-accent-700)]' : 'text-muted'"
      >
        {{ store.guests.length }} guests, {{ store.totalSeats }} seats
        <template v-if="seatBalance < 0"> — {{ -seatBalance }} short</template>
        <template v-else-if="seatBalance > 0"> — {{ seatBalance }} spare</template>
      </p>
    </div>

    <RuleWarnings class="mt-3" />

    <p v-if="!store.tables.length" class="text-muted mt-12 text-center">
      No tables yet — add some above, e.g. “2 tables of 8”.
    </p>

    <div v-else class="mt-4 flex flex-col gap-4 lg:flex-row">
      <aside class="lg:w-64 lg:shrink-0">
        <div class="card">
          <h2 class="card-title mb-0">
            Unseated
            <span class="text-muted tnum">· {{ store.unassignedGuests.length }}</span>
          </h2>
          <input v-model="search" type="search" placeholder="Search…" class="input" />
          <p v-if="!store.guests.length" class="text-muted mb-0 text-[13px]">
            Add guests on the Guests tab first.
          </p>
          <p v-else-if="!store.unassignedGuests.length" class="mb-0 text-[13px] text-[var(--color-accent-700)]">
            Everyone has a seat
          </p>
          <div class="flex min-h-24 flex-wrap content-start gap-1.5">
            <GuestChip
              v-for="guest in unassignedList"
              :key="guest.id"
              :guest="guest"
              class="cursor-pointer"
              :class="{ 'is-held': selectedGuestId === guest.id }"
              @click="toggleSelect(guest.id)"
            />
          </div>
          <p class="text-muted mb-0 text-xs">
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
