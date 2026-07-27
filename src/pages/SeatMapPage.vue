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

// --- Pointer drag, with a click fallback when the pointer barely moves --------

const ghost = ref<{ name: string; color?: string; x: number; y: number } | null>(null)
let pending: { x: number; y: number; guestId: string; onClick: () => void; moved: boolean } | null =
  null

function beginDrag(guestId: string, onClick: () => void, event: PointerEvent) {
  if (event.button !== 0) return
  pending = { x: event.clientX, y: event.clientY, guestId, onClick, moved: false }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
}

function onPointerMove(event: PointerEvent) {
  if (!pending) return
  if (!pending.moved && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < 5) return
  pending.moved = true
  const guest = store.guests.find((g) => g.id === pending!.guestId)
  ghost.value = {
    name: guest?.name ?? '',
    color: store.groupColor(guest?.group),
    x: event.clientX,
    y: event.clientY,
  }
}

function onPointerUp(event: PointerEvent) {
  window.removeEventListener('pointermove', onPointerMove)
  const drag = pending
  pending = null
  ghost.value = null
  if (!drag) return
  if (!drag.moved) {
    drag.onClick() // treated as a plain click
    return
  }
  // Dropped after moving: seat under the pointer wins; the tray unseats.
  const target = document.elementFromPoint(event.clientX, event.clientY)
  const seat = target?.closest('[data-seat]') as HTMLElement | null
  if (seat?.dataset.tableId) {
    store.assignGuest(drag.guestId, seat.dataset.tableId, Number(seat.dataset.seatIndex))
  } else if (target?.closest('[data-unseated-zone]')) {
    store.unseatGuest(drag.guestId)
  }
  selectedGuestId.value = null
}

/** Grid delegation: each seat carries its identity in data-* attributes. */
function onSeatPointerDown(event: PointerEvent) {
  const seat = (event.target as Element).closest('[data-seat]') as HTMLElement | null
  if (!seat?.dataset.tableId) return
  const table = store.tables.find((t) => t.id === seat.dataset.tableId)
  if (!table) return
  const seatIndex = Number(seat.dataset.seatIndex)
  const guestId = table.seats[seatIndex] ?? selectedGuestId.value
  if (!guestId) return // empty seat with nobody held: nothing to click or drag
  beginDrag(guestId, () => onSeatClick(table, seatIndex), event)
}

/** Keyboard: Enter/Space on a focused seat behaves like a click. */
function onSeatKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const seat = (event.target as Element).closest('[data-seat]') as HTMLElement | null
  if (!seat?.dataset.tableId) return
  const table = store.tables.find((t) => t.id === seat.dataset.tableId)
  if (!table) return
  event.preventDefault()
  onSeatClick(table, Number(seat.dataset.seatIndex))
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
            <div
              data-unseated-zone
              class="mt-2 flex min-h-24 flex-wrap content-start gap-1.5 rounded-lg"
            >
              <GuestChip
                v-for="guest in unassignedList"
                :key="guest.id"
                :guest="guest"
                class="cursor-pointer touch-none"
                :class="{ '!border-emerald-500 ring-1 ring-emerald-300': selectedGuestId === guest.id }"
                @pointerdown="beginDrag(guest.id, () => toggleSelect(guest.id), $event)"
              />
            </div>
            <p class="mt-2 text-xs text-stone-400">
              Drag a guest onto a seat — or click a guest, then a seat. Drag a seated guest to another
              seat to move or swap them, or back here to unseat. Set each table's shape in its header.
            </p>
          </div>
        </aside>

        <div
          class="grid flex-1 gap-4 md:grid-cols-2 2xl:grid-cols-3"
          @pointerdown="onSeatPointerDown"
          @keydown="onSeatKeydown"
        >
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
              class="mt-2 h-64 w-full sm:h-72"
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

    <!-- Floating chip that follows the pointer while dragging. -->
    <div
      v-if="ghost"
      class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-sm shadow-lg"
      :style="{ left: `${ghost.x}px`, top: `${ghost.y}px` }"
    >
      <span
        v-if="ghost.color"
        class="mr-1 inline-block size-2 rounded-full align-middle"
        :style="{ backgroundColor: ghost.color }"
      />
      {{ ghost.name }}
    </div>
  </div>
</template>
