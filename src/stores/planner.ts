import { defineStore } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'

export interface Guest {
  id: string
  name: string
  group?: string
  notes?: string
}

export type TableShapeKind = 'round' | 'square' | 'rectangle'

export interface TableShape {
  kind: TableShapeKind
  /**
   * Seats per side, clockwise from the top edge: [top, right, bottom, left].
   * Only present for square/rectangle; their sum equals the table capacity.
   */
  sides?: [number, number, number, number]
}

export interface Table {
  id: string
  name: string
  capacity: number
  /** One entry per seat: a guest id or null (empty). Length === capacity. */
  seats: (string | null)[]
  /** Optional physical shape; absent means a plain round table. */
  shape?: TableShape
}

export type RuleKind = 'couple' | 'together' | 'apart'

export interface Rule {
  id: string
  a: string
  b: string
  kind: RuleKind
}

export interface Violation {
  rule: Rule
  a: Guest
  b: Guest
  message: string
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
  shape?: { kind?: string; sides?: number[] }
  /** Legacy (sticky-list model): compact guest list. */
  guestIds?: string[]
}

interface PersistedState {
  version: 1
  guests: Guest[]
  tables: PersistedTable[]
  rules?: Rule[]
  /** Legacy (range-based model): explicit unseated tail length. */
  unseated?: number
}

const STORAGE_KEY = 'seatplanner:v1'
const SNAPSHOT_PREFIX = 'seatplanner:snap:'
const SNAPSHOT_KEEP = 10
const SNAPSHOT_MIN_INTERVAL_MS = 5 * 60_000
const UNDO_DEPTH = 50

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

interface PlanState {
  guests: Guest[]
  tables: Table[]
  rules: Rule[]
}

/** Spread a seat count as evenly as possible over four sides [top, right, bottom, left]. */
function distributeSquare(capacity: number): [number, number, number, number] {
  const n = Math.max(0, Math.floor(capacity))
  const base = Math.floor(n / 4)
  const sides: [number, number, number, number] = [base, base, base, base]
  for (let i = 0; i < n - base * 4; i++) sides[i]++
  return sides
}

/**
 * Turn a user's side list into [top, right, bottom, left]:
 *  - one number  → all four sides equal
 *  - two numbers → [long, short] repeated (long = top/bottom, short = left/right)
 *  - three/four  → taken as given (three reuses the second value for the last side)
 */
function normalizeSides(input: number[]): [number, number, number, number] {
  const a = input.map((n) => Math.max(0, Math.floor(Number(n) || 0)))
  if (a.length <= 1) {
    const v = a[0] ?? 0
    return [v, v, v, v]
  }
  if (a.length === 2) return [a[0]!, a[1]!, a[0]!, a[1]!]
  if (a.length === 3) return [a[0]!, a[1]!, a[2]!, a[1]!]
  return [a[0]!, a[1]!, a[2]!, a[3]!]
}

/** Parse and sanitize persisted/imported JSON; handles legacy shapes. Null if invalid. */
function parseState(raw: string | null): PlanState | null {
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

        // Optional shape; square/rectangle define capacity by their side counts.
        let shape: TableShape | undefined
        const rawShape = t.shape
        if (rawShape?.kind === 'round') {
          shape = { kind: 'round' }
        } else if (rawShape?.kind === 'square' || rawShape?.kind === 'rectangle') {
          const sides = Array.isArray(rawShape.sides)
            ? rawShape.sides.map((n) => Math.max(0, Math.floor(Number(n) || 0)))
            : []
          if (sides.length === 4 && sides.some((n) => n > 0)) {
            shape = { kind: rawShape.kind, sides: sides as [number, number, number, number] }
          }
        }

        const capacity = shape?.sides ? shape.sides.reduce((a, b) => a + b, 0) : t.capacity
        seats = seats.slice(0, capacity)
        while (seats.length < capacity) seats.push(null)
        return { id: t.id, name: t.name, capacity, seats, shape }
      })

      const kinds: RuleKind[] = ['couple', 'together', 'apart']
      const rules = (Array.isArray(state.rules) ? state.rules : []).filter(
        (r): r is Rule =>
          typeof r === 'object' &&
          r !== null &&
          known.has(r.a) &&
          known.has(r.b) &&
          r.a !== r.b &&
          kinds.includes(r.kind),
      )
      return { guests: state.guests, tables, rules }
    }
  } catch {
    // Fall through: invalid JSON or wrong shape.
  }
  return null
}

function loadState(): PlanState {
  // Corrupt/missing data: start fresh rather than crash.
  return (
    parseState(localStorage.getItem(STORAGE_KEY)) ?? { guests: [], tables: [], rules: [] }
  )
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
  const rules = ref<Rule[]>(initial.rules)

  // --- Persistence, undo history, snapshots, cross-tab sync ---

  const serialize = (): string =>
    JSON.stringify({ version: 1, guests: guests.value, tables: tables.value, rules: rules.value })

  const undoStack = ref<string[]>([])
  const redoStack = ref<string[]>([])
  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)
  let lastSerialized = serialize()
  let applying = false
  let lastSnapshotAt = 0
  const snapshotsVersion = ref(0)

  watch(
    [guests, tables, rules],
    () => {
      const current = serialize()
      if (current === lastSerialized) return
      if (!applying) {
        undoStack.value.push(lastSerialized)
        if (undoStack.value.length > UNDO_DEPTH) undoStack.value.shift()
        redoStack.value = []
        if (Date.now() - lastSnapshotAt > SNAPSHOT_MIN_INTERVAL_MS) saveSnapshot()
      }
      lastSerialized = current
      localStorage.setItem(STORAGE_KEY, current)
    },
    { deep: true },
  )

  async function applyState(state: PlanState): Promise<void> {
    applying = true
    guests.value = state.guests
    tables.value = state.tables
    rules.value = state.rules
    await nextTick()
    applying = false
  }

  async function undo(): Promise<void> {
    const previous = undoStack.value.pop()
    if (previous === undefined) return
    redoStack.value.push(lastSerialized)
    await applyState(parseState(previous) ?? { guests: [], tables: [], rules: [] })
  }

  async function redo(): Promise<void> {
    const next = redoStack.value.pop()
    if (next === undefined) return
    undoStack.value.push(lastSerialized)
    await applyState(parseState(next) ?? { guests: [], tables: [], rules: [] })
  }

  /** Other tabs write the same key; mirror their changes without recording history. */
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || event.newValue === null) return
    if (event.newValue === lastSerialized) return
    const state = parseState(event.newValue)
    if (state) {
      lastSerialized = event.newValue
      void applyState(state)
    }
  })

  function saveSnapshot(): void {
    lastSnapshotAt = Date.now()
    localStorage.setItem(`${SNAPSHOT_PREFIX}${lastSnapshotAt}`, lastSerialized)
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith(SNAPSHOT_PREFIX))
      .sort()
    for (const key of keys.slice(0, Math.max(0, keys.length - SNAPSHOT_KEEP))) {
      localStorage.removeItem(key)
    }
    snapshotsVersion.value++
  }

  const snapshots = computed(() => {
    void snapshotsVersion.value
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(SNAPSHOT_PREFIX))
      .sort()
      .reverse()
      .map((key) => {
        const state = parseState(localStorage.getItem(key))
        return {
          key,
          takenAt: new Date(Number(key.slice(SNAPSHOT_PREFIX.length))),
          guests: state?.guests.length ?? 0,
          seated: state?.tables.reduce((n, t) => n + t.seats.filter(Boolean).length, 0) ?? 0,
        }
      })
  })

  /** Restore a snapshot (recorded in undo history, so it can itself be undone). */
  function restoreSnapshot(key: string): boolean {
    const state = parseState(localStorage.getItem(key))
    if (!state) return false
    guests.value = state.guests
    tables.value = state.tables
    rules.value = state.rules
    return true
  }

  // --- Derived state ---

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

  // --- Rules ---

  function addRule(a: string, b: string, kind: RuleKind): void {
    if (a === b || !guestById.value.has(a) || !guestById.value.has(b)) return
    const exists = rules.value.some(
      (r) => r.kind === kind && ((r.a === a && r.b === b) || (r.a === b && r.b === a)),
    )
    if (!exists) rules.value.push({ id: crypto.randomUUID(), a, b, kind })
  }

  function removeRule(id: string): void {
    rules.value = rules.value.filter((r) => r.id !== id)
  }

  /** Two seat indices are neighbors if consecutive around the table's perimeter. */
  function seatsAdjacent(table: Table, idA: string, idB: string): boolean {
    const ia = table.seats.indexOf(idA)
    const ib = table.seats.indexOf(idB)
    if (ia === -1 || ib === -1) return false
    const gap = Math.abs(ia - ib)
    return gap === 1 || gap === table.capacity - 1 // adjacent, or wrapping across the seam
  }

  /** Rules currently broken by the seating (both guests seated, wrong tables/seats). */
  const violations = computed<Violation[]>(() => {
    const out: Violation[] = []
    for (const rule of rules.value) {
      const a = guestById.value.get(rule.a)
      const b = guestById.value.get(rule.b)
      if (!a || !b) continue
      const tableA = tableByGuestId.value.get(rule.a)
      const tableB = tableByGuestId.value.get(rule.b)
      if (!tableA || !tableB) continue
      if (rule.kind === 'apart') {
        if (tableA.id === tableB.id) {
          out.push({ rule, a, b, message: `${a.name} and ${b.name} should not share a table (${tableA.name})` })
        }
      } else if (tableA.id !== tableB.id) {
        const label = rule.kind === 'couple' ? 'are a couple' : 'should sit together'
        out.push({ rule, a, b, message: `${a.name} and ${b.name} ${label} but sit at ${tableA.name} and ${tableB.name}` })
      } else if (rule.kind === 'couple' && !seatsAdjacent(tableA, rule.a, rule.b)) {
        // Same table but not side by side — a couple should share neighboring seats.
        out.push({ rule, a, b, message: `${a.name} and ${b.name} are a couple but don't sit next to each other at ${tableA.name}` })
      }
    }
    return out
  })

  const violatingGuestIds = computed(() => {
    const set = new Set<string>()
    for (const v of violations.value) {
      set.add(v.a.id)
      set.add(v.b.id)
    }
    return set
  })

  /** Reorder the master list so each couple sits adjacent (partner pulled to partner). */
  function snapCouplesAdjacent(): void {
    for (const rule of rules.value.filter((r) => r.kind === 'couple')) {
      const ia = guests.value.findIndex((g) => g.id === rule.a)
      const ib = guests.value.findIndex((g) => g.id === rule.b)
      if (ia === -1 || ib === -1 || Math.abs(ia - ib) === 1) continue
      const [partner] = guests.value.splice(ib, 1)
      if (!partner) continue
      const anchor = guests.value.findIndex((g) => g.id === rule.a)
      guests.value.splice(anchor + 1, 0, partner)
    }
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
    rules.value = rules.value.filter((r) => r.a !== id && r.b !== id)
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
    saveSnapshot()
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
      // A square table's sides are derived from its capacity — keep them in step.
      if (table.shape?.kind === 'square') table.shape = { kind: 'square', sides: distributeSquare(capacity) }
    }
  }

  /**
   * Set a table's physical shape. Square/rectangle capacities follow their side
   * counts (a square splits its current capacity evenly; a rectangle uses the
   * given sides). Returns false if the new size would unseat an already-seated
   * guest — nobody is ever dropped from a seat.
   */
  function setTableShape(id: string, kind: TableShapeKind, sides?: number[]): boolean {
    const table = tables.value.find((t) => t.id === id)
    if (!table) return false
    if (kind === 'round') {
      table.shape = { kind: 'round' }
      return true
    }
    const resolved =
      kind === 'rectangle'
        ? normalizeSides(sides ?? table.shape?.sides ?? distributeSquare(table.capacity))
        : distributeSquare(sides ? sides.reduce((a, b) => a + b, 0) : table.capacity)
    const total = resolved.reduce((a, b) => a + b, 0)
    if (total < 1) return false
    const lastOccupied = table.seats.reduce((last, sid, i) => (sid ? i : last), -1)
    if (total < lastOccupied + 1) return false // would unseat someone
    table.seats =
      total > table.capacity
        ? [...table.seats, ...Array.from({ length: total - table.capacity }, () => null)]
        : table.seats.slice(0, total)
    table.capacity = total
    table.shape = { kind, sides: resolved }
    return true
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

  /** Serialize the current plan for download or sharing. */
  function exportState(): string {
    return JSON.stringify(
      { version: 1, guests: guests.value, tables: tables.value, rules: rules.value },
      null,
      2,
    )
  }

  /** Replace the whole plan from an exported file or share link. Returns false if invalid. */
  function importState(json: string): boolean {
    const state = parseState(json)
    if (!state) return false
    saveSnapshot()
    guests.value = state.guests
    tables.value = state.tables
    rules.value = state.rules
    return true
  }

  return {
    guests,
    tables,
    rules,
    groups,
    groupColor,
    tableRanges,
    tableByGuestId,
    seatOccupants,
    unassignedGuests,
    totalSeats,
    seatedCount,
    violations,
    violatingGuestIds,
    canUndo,
    canRedo,
    snapshots,
    undo,
    redo,
    restoreSnapshot,
    addRule,
    removeRule,
    snapCouplesAdjacent,
    addGuest,
    addGuestsBulk,
    updateGuest,
    removeGuest,
    moveGuest,
    assignAllInOrder,
    addTable,
    addTables,
    updateTable,
    setTableShape,
    removeTable,
    assignGuest,
    unseatGuest,
    unseatToPosition,
    exportState,
    importState,
  }
})
