import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export interface Guest {
  id: string
  name: string
  group?: string
  notes?: string
}

export interface Table {
  id: string
  name: string
  capacity: number
}

/** The slice of the guest order this table covers: guests[start, end). */
export interface TableRange {
  table: Table
  start: number
  end: number
}

interface PersistedState {
  version: 1
  guests: Guest[]
  tables: Table[]
}

const STORAGE_KEY = 'seatplanner:v1'

// Order matters: groups get colors by first appearance, so the palette must be stable.
export const GROUP_COLORS = [
  '#e11d48', // rose
  '#2563eb', // blue
  '#16a34a', // green
  '#d97706', // amber
  '#9333ea', // purple
  '#0d9488', // teal
  '#db2777', // pink
  '#65a30d', // lime
  '#7c3aed', // violet
  '#0284c7', // sky
]

function loadState(): Pick<PersistedState, 'guests' | 'tables'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { guests: [], tables: [] }
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as PersistedState).guests) &&
      Array.isArray((parsed as PersistedState).tables)
    ) {
      const state = parsed as PersistedState
      return {
        guests: state.guests,
        // Strip legacy fields (early versions stored per-table guest lists).
        tables: state.tables.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity })),
      }
    }
  } catch {
    // Corrupt data: start fresh rather than crash.
  }
  return { guests: [], tables: [] }
}

/**
 * Seating model: tables claim consecutive ranges of the guest order.
 * Table 1 seats guests[0..cap1), table 2 seats guests[cap1..cap1+cap2), etc.
 * Reordering the circle IS reseating; guests past the last seat are unseated.
 */
export const usePlannerStore = defineStore('planner', () => {
  const initial = loadState()
  const guests = ref<Guest[]>(initial.guests)
  const tables = ref<Table[]>(initial.tables)

  watch(
    [guests, tables],
    () => {
      const state: PersistedState = {
        version: 1,
        guests: guests.value,
        tables: tables.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    },
    { deep: true },
  )

  const groups = computed(() => {
    const seen: string[] = []
    for (const guest of guests.value) {
      if (guest.group && !seen.includes(guest.group)) seen.push(guest.group)
    }
    return seen
  })

  function groupColor(group: string | undefined): string | undefined {
    if (!group) return undefined
    const index = groups.value.indexOf(group)
    if (index === -1) return undefined
    return GROUP_COLORS[index % GROUP_COLORS.length]
  }

  const tableRanges = computed<TableRange[]>(() => {
    let start = 0
    return tables.value.map((table) => {
      const range = { table, start, end: start + table.capacity }
      start = range.end
      return range
    })
  })

  const totalSeats = computed(() =>
    tables.value.reduce((sum, table) => sum + table.capacity, 0),
  )

  function tableForIndex(index: number): Table | undefined {
    return tableRanges.value.find((r) => index >= r.start && index < r.end)?.table
  }

  const tableByGuestId = computed(() => {
    const map = new Map<string, Table>()
    guests.value.forEach((guest, index) => {
      const table = tableForIndex(index)
      if (table) map.set(guest.id, table)
    })
    return map
  })

  function tableGuests(tableId: string): Guest[] {
    const range = tableRanges.value.find((r) => r.table.id === tableId)
    if (!range) return []
    return guests.value.slice(range.start, Math.min(range.end, guests.value.length))
  }

  const unassignedGuests = computed(() => guests.value.slice(totalSeats.value))

  // --- Guest actions ---

  function addGuest(name: string, group?: string, notes?: string): Guest | undefined {
    const trimmed = name.trim()
    if (!trimmed) return undefined
    const guest: Guest = {
      id: crypto.randomUUID(),
      name: trimmed,
      group: group?.trim() || undefined,
      notes: notes?.trim() || undefined,
    }
    guests.value.push(guest)
    return guest
  }

  function addGuestsBulk(names: string): number {
    let added = 0
    for (const line of names.split('\n')) {
      if (addGuest(line)) added++
    }
    return added
  }

  function updateGuest(id: string, patch: Partial<Omit<Guest, 'id'>>): void {
    const guest = guests.value.find((g) => g.id === id)
    if (!guest) return
    if (patch.name !== undefined) guest.name = patch.name.trim() || guest.name
    if ('group' in patch) guest.group = patch.group?.trim() || undefined
    if ('notes' in patch) guest.notes = patch.notes?.trim() || undefined
  }

  function removeGuest(id: string): void {
    guests.value = guests.value.filter((g) => g.id !== id)
  }

  function moveGuest(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return
    const [guest] = guests.value.splice(fromIndex, 1)
    if (guest) guests.value.splice(toIndex, 0, guest)
  }

  function moveGuestToEnd(guestId: string): void {
    const from = guests.value.findIndex((g) => g.id === guestId)
    if (from !== -1) moveGuest(from, guests.value.length - 1)
  }

  // --- Table actions ---

  function addTable(capacity: number, name?: string): Table {
    const table: Table = {
      id: crypto.randomUUID(),
      name: name ?? `Table ${tables.value.length + 1}`,
      capacity,
    }
    tables.value.push(table)
    return table
  }

  function addTables(count: number, capacity: number): void {
    for (let i = 0; i < count; i++) addTable(capacity)
  }

  function updateTable(id: string, patch: Partial<Pick<Table, 'name' | 'capacity'>>): void {
    const table = tables.value.find((t) => t.id === id)
    if (!table) return
    if (patch.name !== undefined) table.name = patch.name.trim() || table.name
    if (patch.capacity !== undefined) table.capacity = Math.max(1, Math.floor(patch.capacity))
  }

  function removeTable(id: string): void {
    tables.value = tables.value.filter((t) => t.id !== id)
  }

  /** Move a guest into a table's range (at its last seat). Guests behind them cascade. */
  function assignGuest(guestId: string, tableId: string): boolean {
    const range = tableRanges.value.find((r) => r.table.id === tableId)
    const from = guests.value.findIndex((g) => g.id === guestId)
    if (!range || from === -1) return false
    if (from >= range.start && from < range.end) return true
    const to =
      from < range.start
        ? Math.min(range.end, guests.value.length) - 1
        : Math.max(range.start, range.end - 1)
    moveGuest(from, to)
    return true
  }

  /**
   * Sync a table's displayed guest list after a drag & drop. Detects the single
   * added or reordered guest and translates it into a move in the global order;
   * removal-only changes are ignored (the gaining list performs the move).
   */
  function reconcileTableList(tableId: string, ids: string[]): void {
    const range = tableRanges.value.find((r) => r.table.id === tableId)
    if (!range) return
    const prev = tableGuests(tableId).map((g) => g.id)
    const added = ids.filter((id) => !prev.includes(id))

    if (added.length === 1) {
      const guestId = added[0]!
      const from = guests.value.findIndex((g) => g.id === guestId)
      if (from === -1) return
      const to = Math.min(range.start + ids.indexOf(guestId), guests.value.length - 1)
      moveGuest(from, to)
      return
    }

    if (added.length === 0 && ids.length === prev.length && ids.some((id, i) => id !== prev[i])) {
      // In-table reorder: find the one guest whose removal makes both orders agree.
      const without = (arr: string[], id: string) => arr.filter((x) => x !== id)
      for (const [newPos, id] of ids.entries()) {
        const rest = without(ids, id)
        if (without(prev, id).every((x, i) => x === rest[i])) {
          moveGuest(range.start + prev.indexOf(id), range.start + newPos)
          return
        }
      }
    }
  }

  /** Sync the unseated (overflow) list after a drop: anything new moves to the end. */
  function reconcileUnassignedList(ids: string[]): void {
    const overflow = new Set(unassignedGuests.value.map((g) => g.id))
    for (const id of ids) {
      if (!overflow.has(id)) moveGuestToEnd(id)
    }
  }

  return {
    guests,
    tables,
    groups,
    groupColor,
    tableRanges,
    tableForIndex,
    tableByGuestId,
    tableGuests,
    unassignedGuests,
    totalSeats,
    addGuest,
    addGuestsBulk,
    updateGuest,
    removeGuest,
    moveGuest,
    moveGuestToEnd,
    addTable,
    addTables,
    updateTable,
    removeTable,
    assignGuest,
    reconcileTableList,
    reconcileUnassignedList,
  }
})
