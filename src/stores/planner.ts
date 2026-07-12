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
  guestIds: string[]
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
      return { guests: state.guests, tables: state.tables }
    }
  } catch {
    // Corrupt data: start fresh rather than crash.
  }
  return { guests: [], tables: [] }
}

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

  const tableByGuestId = computed(() => {
    const map = new Map<string, Table>()
    for (const table of tables.value) {
      for (const guestId of table.guestIds) map.set(guestId, table)
    }
    return map
  })

  const unassignedGuests = computed(() =>
    guests.value.filter((guest) => !tableByGuestId.value.has(guest.id)),
  )

  const totalSeats = computed(() =>
    tables.value.reduce((sum, table) => sum + table.capacity, 0),
  )

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
    for (const table of tables.value) {
      table.guestIds = table.guestIds.filter((guestId) => guestId !== id)
    }
  }

  function moveGuest(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return
    const [guest] = guests.value.splice(fromIndex, 1)
    if (guest) guests.value.splice(toIndex, 0, guest)
  }

  // --- Table actions ---

  function addTable(capacity: number, name?: string): Table {
    const table: Table = {
      id: crypto.randomUUID(),
      name: name ?? `Table ${tables.value.length + 1}`,
      capacity,
      guestIds: [],
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
    if (patch.capacity !== undefined && patch.capacity >= table.guestIds.length) {
      table.capacity = Math.max(1, Math.floor(patch.capacity))
    }
  }

  function removeTable(id: string): void {
    tables.value = tables.value.filter((t) => t.id !== id)
  }

  function assignGuest(guestId: string, tableId: string, seatIndex?: number): boolean {
    const table = tables.value.find((t) => t.id === tableId)
    if (!table) return false
    const alreadyHere = table.guestIds.includes(guestId)
    if (!alreadyHere && table.guestIds.length >= table.capacity) return false
    unassignGuest(guestId)
    const index = seatIndex ?? table.guestIds.length
    table.guestIds.splice(Math.min(index, table.guestIds.length), 0, guestId)
    return true
  }

  /** Replace a table's seating wholesale (drag & drop sync) — pulls the guests from any other table. */
  function setTableGuests(tableId: string, guestIds: string[]): void {
    const table = tables.value.find((t) => t.id === tableId)
    if (!table) return
    const ids = [...new Set(guestIds)].slice(0, table.capacity)
    for (const other of tables.value) {
      if (other.id !== tableId) {
        other.guestIds = other.guestIds.filter((id) => !ids.includes(id))
      }
    }
    table.guestIds = ids
  }

  function unassignGuest(guestId: string): void {
    for (const table of tables.value) {
      table.guestIds = table.guestIds.filter((id) => id !== guestId)
    }
  }

  return {
    guests,
    tables,
    groups,
    groupColor,
    tableByGuestId,
    unassignedGuests,
    totalSeats,
    addGuest,
    addGuestsBulk,
    updateGuest,
    removeGuest,
    moveGuest,
    addTable,
    addTables,
    updateTable,
    removeTable,
    assignGuest,
    setTableGuests,
    unassignGuest,
  }
})
