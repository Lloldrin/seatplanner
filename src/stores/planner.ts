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
  /** Seated guests in seat order; length <= capacity. Assignments are sticky. */
  guestIds: string[]
}

/** The fixed block of circle slots this table owns: slots [start, end). */
export interface TableRange {
  table: Table
  start: number
  end: number
}

interface PersistedState {
  version: 1
  guests: Guest[]
  tables: Table[]
  /** Legacy (range-based model): explicit unseated tail length. */
  unseated?: number
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

function loadState(): { guests: Guest[]; tables: Table[] } {
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
      const guestIds = new Set(state.guests.map((g) => g.id))
      const claimed = new Set<string>()

      const hasLists = state.tables.every((t) =>
        Array.isArray((t as Partial<Table>).guestIds),
      )
      let cursor = 0
      const seatedMax = Math.max(0, state.guests.length - (state.unseated ?? 0))

      const tables = state.tables.map((t) => {
        let ids: string[]
        if (hasLists) {
          ids = (t.guestIds ?? []).filter(
            (id) => guestIds.has(id) && !claimed.has(id),
          )
        } else {
          // Migrate from the range-based model: seat guests by their circle position.
          const take = Math.max(0, Math.min(t.capacity, seatedMax - cursor))
          ids = state.guests.slice(cursor, cursor + take).map((g) => g.id)
          cursor += take
        }
        ids = ids.slice(0, t.capacity)
        for (const id of ids) claimed.add(id)
        return { id: t.id, name: t.name, capacity: t.capacity, guestIds: ids }
      })
      return { guests: state.guests, tables }
    }
  } catch {
    // Corrupt data: start fresh rather than crash.
  }
  return { guests: [], tables: [] }
}

/**
 * Seating model: every table owns a fixed block of `capacity` circle slots and
 * an explicit guest list. Assignments are sticky — freeing a seat never pulls
 * guests over from another table. Guests in no table are unseated.
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

  const seatedCount = computed(() =>
    tables.value.reduce((sum, table) => sum + table.guestIds.length, 0),
  )

  const tableByGuestId = computed(() => {
    const map = new Map<string, Table>()
    for (const table of tables.value) {
      for (const id of table.guestIds) map.set(id, table)
    }
    return map
  })

  function tableGuests(tableId: string): Guest[] {
    const table = tables.value.find((t) => t.id === tableId)
    if (!table) return []
    return table.guestIds
      .map((id) => guests.value.find((g) => g.id === id))
      .filter((g): g is Guest => g !== undefined)
  }

  /** Guests in no table, in master (entry/circle) order. */
  const unassignedGuests = computed(() =>
    guests.value.filter((g) => !tableByGuestId.value.has(g.id)),
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
    if (patch.capacity !== undefined) {
      // A table can never shrink below its current occupancy.
      table.capacity = Math.max(1, Math.floor(patch.capacity), table.guestIds.length)
    }
  }

  function removeTable(id: string): void {
    tables.value = tables.value.filter((t) => t.id !== id)
  }

  /**
   * Seat a guest at a table, optionally at a specific seat position.
   * Returns false (and changes nothing) if the table is full.
   */
  function assignGuest(guestId: string, tableId: string, position?: number): boolean {
    const table = tables.value.find((t) => t.id === tableId)
    if (!table || !guests.value.some((g) => g.id === guestId)) return false
    const isMember = table.guestIds.includes(guestId)
    if (!isMember && table.guestIds.length >= table.capacity) return false
    unseatGuest(guestId)
    const to = Math.min(position ?? table.guestIds.length, table.guestIds.length)
    table.guestIds.splice(to, 0, guestId)
    return true
  }

  /** Remove a guest from whatever table they sit at; their seat stays empty. */
  function unseatGuest(guestId: string): void {
    for (const table of tables.value) {
      table.guestIds = table.guestIds.filter((id) => id !== guestId)
    }
  }

  /** Unseat and place at `position` within the unseated zone (master-order move). */
  function unseatToPosition(guestId: string, position: number): void {
    unseatGuest(guestId)
    const others = unassignedGuests.value.filter((g) => g.id !== guestId)
    const from = guests.value.findIndex((g) => g.id === guestId)
    if (from === -1) return
    const [guest] = guests.value.splice(from, 1)
    if (!guest) return
    const target = others[position]
    const to = target ? guests.value.findIndex((g) => g.id === target.id) : guests.value.length
    guests.value.splice(to === -1 ? guests.value.length : to, 0, guest)
  }

  /** Replace a table's guest list wholesale (drag & drop sync between cards). */
  function setTableGuests(tableId: string, ids: string[]): void {
    const table = tables.value.find((t) => t.id === tableId)
    if (!table) return
    const known = new Set(guests.value.map((g) => g.id))
    const clean = [...new Set(ids)].filter((id) => known.has(id)).slice(0, table.capacity)
    for (const other of tables.value) {
      if (other.id !== tableId) {
        other.guestIds = other.guestIds.filter((id) => !clean.includes(id))
      }
    }
    table.guestIds = clean
  }

  return {
    guests,
    tables,
    groups,
    groupColor,
    tableRanges,
    tableByGuestId,
    tableGuests,
    unassignedGuests,
    totalSeats,
    seatedCount,
    addGuest,
    addGuestsBulk,
    updateGuest,
    removeGuest,
    addTable,
    addTables,
    updateTable,
    removeTable,
    assignGuest,
    unseatGuest,
    unseatToPosition,
    setTableGuests,
  }
})
