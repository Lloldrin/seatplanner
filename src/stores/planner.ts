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
  /** One entry per seat: a guest id or null (empty). Length === capacity. */
  seats: (string | null)[]
}

/** The fixed block of circle slots this table owns: slots [start, end). */
export interface TableRange {
  table: Table
  start: number
  end: number
}

interface PersistedTable {
  id: string
  name: string
  capacity: number
  seats?: (string | null)[]
  /** Legacy (sticky-list model): compact guest list. */
  guestIds?: string[]
}

interface PersistedState {
  version: 1
  guests: Guest[]
  tables: PersistedTable[]
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

/** Parse and sanitize persisted/imported JSON; handles legacy shapes. Null if invalid. */
function parseState(raw: string | null): { guests: Guest[]; tables: Table[] } | null {
  try {
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as PersistedState).guests) &&
      Array.isArray((parsed as PersistedState).tables)
    ) {
      const state = parsed as PersistedState
      const known = new Set(state.guests.map((g) => g.id))
      const claimed = new Set<string>()
      const claim = (id: unknown): string | null => {
        if (typeof id !== 'string' || !known.has(id) || claimed.has(id)) return null
        claimed.add(id)
        return id
      }

      // Oldest shape (range-based): seat guests by their circle position.
      const hasAnyList = state.tables.every((t) => t.seats ?? t.guestIds)
      let cursor = 0
      const seatedMax = Math.max(0, state.guests.length - (state.unseated ?? 0))

      const tables = state.tables.map((t) => {
        let seats: (string | null)[]
        if (Array.isArray(t.seats)) {
          seats = t.seats.map(claim)
        } else if (Array.isArray(t.guestIds)) {
          seats = t.guestIds.map(claim).filter((id) => id !== null)
        } else if (!hasAnyList) {
          const take = Math.max(0, Math.min(t.capacity, seatedMax - cursor))
          seats = state.guests.slice(cursor, cursor + take).map((g) => claim(g.id))
          cursor += take
        } else {
          seats = []
        }
        seats = seats.slice(0, t.capacity)
        while (seats.length < t.capacity) seats.push(null)
        return { id: t.id, name: t.name, capacity: t.capacity, seats }
      })
      return { guests: state.guests, tables }
    }
  } catch {
    // Fall through: invalid JSON or wrong shape.
  }
  return null
}

function loadState(): { guests: Guest[]; tables: Table[] } {
  // Corrupt/missing data: start fresh rather than crash.
  return parseState(localStorage.getItem(STORAGE_KEY)) ?? { guests: [], tables: [] }
}

/**
 * Seating model: every table has numbered seats (capacity slots). A guest sits
 * at exactly one seat; empty seats stay empty and rearranging one guest never
 * shifts another (placing onto an occupied seat swaps the two guests).
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
    tables.value.reduce((sum, table) => sum + table.seats.filter(Boolean).length, 0),
  )

  const tableByGuestId = computed(() => {
    const map = new Map<string, Table>()
    for (const table of tables.value) {
      for (const id of table.seats) {
        if (id) map.set(id, table)
      }
    }
    return map
  })

  const guestById = computed(() => new Map(guests.value.map((g) => [g.id, g])))

  /** Seat-by-seat occupants of a table (null = empty seat). */
  function seatOccupants(tableId: string): (Guest | null)[] {
    const table = tables.value.find((t) => t.id === tableId)
    if (!table) return []
    return table.seats.map((id) => (id ? (guestById.value.get(id) ?? null) : null))
  }

  /** Guests in no table, in master (entry/circle) order. */
  const unassignedGuests = computed(() =>
    guests.value.filter((g) => !tableByGuestId.value.has(g.id)),
  )

  /** The guest's current seat, if any. */
  function findSeat(guestId: string): { table: Table; index: number } | undefined {
    for (const table of tables.value) {
      const index = table.seats.indexOf(guestId)
      if (index !== -1) return { table, index }
    }
    return undefined
  }

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
    unseatGuest(id)
  }

  /** Reorder the master guest list (the Arrange view's circle order). */
  function moveGuest(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return
    const [guest] = guests.value.splice(fromIndex, 1)
    if (guest) guests.value.splice(toIndex, 0, guest)
  }

  /**
   * Materialize the Arrange order into seats: the first guests fill table 1's
   * seats in order, the next fill table 2, … Replaces all current assignments;
   * guests past the last seat end up unseated.
   */
  function assignAllInOrder(): void {
    let cursor = 0
    for (const table of tables.value) {
      table.seats = table.seats.map(() => {
        const guest = guests.value[cursor]
        if (!guest) return null
        cursor++
        return guest.id
      })
    }
  }

  // --- Table actions ---

  function addTable(capacity: number, name?: string): Table {
    const table: Table = {
      id: crypto.randomUUID(),
      name: name ?? `Table ${tables.value.length + 1}`,
      capacity,
      seats: Array.from({ length: capacity }, () => null),
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
      // Never drop an occupied seat: can't shrink past the last occupied one.
      const lastOccupied = table.seats.reduce((last, id, i) => (id ? i : last), -1)
      const capacity = Math.max(1, Math.floor(patch.capacity), lastOccupied + 1)
      table.seats =
        capacity > table.capacity
          ? [...table.seats, ...Array.from({ length: capacity - table.capacity }, () => null)]
          : table.seats.slice(0, capacity)
      table.capacity = capacity
    }
  }

  function removeTable(id: string): void {
    tables.value = tables.value.filter((t) => t.id !== id)
  }

  /**
   * Put a guest on a specific seat (or the first empty one). If the seat is
   * occupied, the two guests swap places — nobody else moves. Returns false
   * only when no seat is available.
   */
  function assignGuest(guestId: string, tableId: string, seatIndex?: number): boolean {
    const table = tables.value.find((t) => t.id === tableId)
    if (!table || !guestById.value.has(guestId)) return false
    const index = seatIndex ?? table.seats.indexOf(null)
    if (index < 0 || index >= table.capacity) return false
    if (table.seats[index] === guestId) return true

    const previous = findSeat(guestId)
    const occupant = table.seats[index]
    table.seats[index] = guestId
    if (previous) previous.table.seats[previous.index] = occupant ?? null
    // If the guest came from the unseated zone, a swapped-out occupant becomes unseated.
    return true
  }

  /** Remove a guest from their seat; the seat stays empty. */
  function unseatGuest(guestId: string): void {
    const seat = findSeat(guestId)
    if (seat) seat.table.seats[seat.index] = null
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

  /** Serialize the current plan for download. */
  function exportState(): string {
    const state: PersistedState = {
      version: 1,
      guests: guests.value,
      tables: tables.value,
    }
    return JSON.stringify(state, null, 2)
  }

  /** Replace the whole plan from an exported file. Returns false if invalid. */
  function importState(json: string): boolean {
    const state = parseState(json)
    if (!state) return false
    guests.value = state.guests
    tables.value = state.tables
    return true
  }

  return {
    guests,
    tables,
    groups,
    groupColor,
    tableRanges,
    tableByGuestId,
    seatOccupants,
    unassignedGuests,
    totalSeats,
    seatedCount,
    addGuest,
    addGuestsBulk,
    updateGuest,
    removeGuest,
    moveGuest,
    assignAllInOrder,
    addTable,
    addTables,
    updateTable,
    removeTable,
    assignGuest,
    unseatGuest,
    unseatToPosition,
    exportState,
    importState,
  }
})
