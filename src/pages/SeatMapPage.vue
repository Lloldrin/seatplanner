<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Table } from '../stores/planner'
import { usePlannerStore } from '../stores/planner'
import GuestChip from '../components/GuestChip.vue'
import RuleWarnings from '../components/RuleWarnings.vue'
import TableSeatMap from '../components/TableSeatMap.vue'
import TableShapeControl from '../components/TableShapeControl.vue'
import { isLongTable } from '../tableGeometry'

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
    <p v-if="!store.tables.length" class="text-muted mt-12 text-center">
      No tables yet — add some on the <RouterLink to="/tables">Tables</RouterLink> tab,
      then come back to seat people around them.
    </p>

    <template v-else>
      <RuleWarnings />

      <div class="mt-3 flex flex-col gap-4 lg:flex-row">
        <aside class="lg:w-64 lg:shrink-0">
          <div class="card">
            <h2 class="card-title mb-0">
              Unseated
              <span class="text-muted tnum">· {{ store.unassignedGuests.length }}</span>
            </h2>
            <input
              v-model="search"
              type="search"
              placeholder="Search…"
              class="input"
            />
            <p v-if="!store.guests.length" class="text-muted mb-0 text-[13px]">
              Add guests on the Guests tab first.
            </p>
            <p v-else-if="!store.unassignedGuests.length" class="mb-0 text-[13px] text-[var(--color-accent-700)]">
              Everyone has a seat
            </p>
            <div
              data-unseated-zone
              class="flex min-h-24 flex-wrap content-start gap-1.5 rounded-[var(--radius-md)]"
            >
              <GuestChip
                v-for="guest in unassignedList"
                :key="guest.id"
                :guest="guest"
                class="cursor-pointer touch-none"
                :class="{ 'is-held': selectedGuestId === guest.id }"
                @pointerdown="beginDrag(guest.id, () => toggleSelect(guest.id), $event)"
              />
            </div>
            <p class="text-muted mb-0 text-xs">
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
            class="card gap-0"
            :class="{ 'is-held': selectedGuestId, 'col-span-full': isLongTable(table) }"
          >
            <div class="flex items-center gap-2">
              <input
                :value="table.name"
                class="card-title w-0 min-w-0 flex-1 border-0 bg-transparent px-1 py-0.5"
                @change="store.updateTable(table.id, { name: ($event.target as HTMLInputElement).value })"
              />
              <span
                class="tnum text-xs"
                :class="
                  table.seats.filter(Boolean).length >= table.capacity
                    ? 'text-[var(--color-accent-700)]'
                    : 'text-muted'
                "
              >
                {{ table.seats.filter(Boolean).length }}/{{ table.capacity }}
              </span>
            </div>
            <TableShapeControl :table="table" class="mt-1.5" />

            <TableSeatMap
              :table="table"
              :selected-guest-id="selectedGuestId"
              interactive
              class="mt-2 w-full"
              :class="isLongTable(table) ? 'h-auto max-h-[80vh]' : 'h-64 sm:h-72'"
            />
          </div>
        </div>
      </div>

      <div v-if="store.groups.length" class="mt-3 flex flex-wrap justify-center gap-3">
        <span
          v-for="group in store.groups"
          :key="group"
          class="text-muted inline-flex items-center gap-1.5 text-xs"
        >
          <span class="size-2 rounded-full" :style="{ backgroundColor: store.groupColor(group) }" />
          {{ group }}
        </span>
      </div>
    </template>

    <!-- Floating chip that follows the pointer while dragging. -->
    <div
      v-if="ghost"
      class="elev-lg pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-2.5 py-1 text-[13px]"
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
