import type { Table } from './stores/planner'

/**
 * Where each seat sits when a table is drawn to scale. Coordinates are in a
 * local space centred on the table (origin = table centre); the SVG's viewBox
 * frames them with room for name labels.
 */
export interface SeatPos {
  index: number
  x: number
  y: number
  side: 'top' | 'right' | 'bottom' | 'left' | 'round'
  /** Label rotation for round tables (radians); 0 for straight-edge seats. */
  angle: number
  /** Round seats on the left half read better flipped 180°. */
  flipped: boolean
}

export type TableOutline =
  | { kind: 'round'; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }

export interface TableLayout {
  seats: SeatPos[]
  outline: TableOutline
  viewBox: string
}

const SPACING = 42 // seat-to-seat spacing along an edge / around the ring
const GAP = 26 // distance from the table edge out to the seat centre
const PAD_X = 96 // viewBox room for side name labels
const PAD_Y = 44
const TAU = Math.PI * 2

/**
 * viewBox framing the seats plus room for printed name labels. `labelWidth` is
 * the longest label's width; 0 keeps the default padding (interactive maps).
 */
function box(seats: SeatPos[], labelWidth: number, round: boolean): string {
  const reach = labelWidth + 16 // seat-centre offset plus a little breathing room
  // Round labels point outward in every direction; straight tables put
  // horizontal labels at the sides and 45° ones (sin 45° ≈ 0.71 tall) top and bottom.
  const padX = Math.max(PAD_X, reach)
  const padY = Math.max(PAD_Y, round ? reach : reach * 0.71)
  const xs = seats.map((s) => s.x)
  const ys = seats.map((s) => s.y)
  const minX = Math.min(-40, ...xs)
  const maxX = Math.max(40, ...xs)
  const minY = Math.min(-40, ...ys)
  const maxY = Math.max(40, ...ys)
  return `${minX - padX} ${minY - padY} ${maxX - minX + padX * 2} ${maxY - minY + padY * 2}`
}

/** More than 10 seats on any straight side: drawn full-width so seats stay legible. */
export function isLongTable(table: Table): boolean {
  return table.shape?.kind !== 'round' && (table.shape?.sides ?? []).some((n) => n > 10)
}

/**
 * Compute drawn seat positions and the table outline for `table`.
 * `labelWidth` (px) reserves viewBox room for printed name labels.
 */
export function tableLayout(table: Table, labelWidth = 0): TableLayout {
  const shape = table.shape

  // Round (default): seats spread evenly around a ring sized to fit them.
  if (!shape || shape.kind === 'round' || !shape.sides) {
    const n = Math.max(1, table.capacity)
    const r = Math.max(66, (n * SPACING) / TAU)
    const seats: SeatPos[] = []
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * TAU - Math.PI / 2
      seats.push({
        index: i,
        x: r * Math.cos(angle),
        y: r * Math.sin(angle),
        side: 'round',
        angle,
        flipped: Math.cos(angle) < -0.001,
      })
    }
    return { seats, outline: { kind: 'round', r: Math.max(30, r - GAP) }, viewBox: box(seats, labelWidth, true) }
  }

  // Straight-edged: walk the perimeter clockwise — top, right, bottom, left.
  const [top, right, bottom, left] = shape.sides
  let w = Math.max(1, Math.max(top, bottom)) * SPACING
  let h = Math.max(1, Math.max(left, right)) * SPACING
  if (shape.kind === 'square') {
    const side = Math.max(w, h)
    w = side
    h = side
  }
  const halfW = w / 2
  const halfH = h / 2
  const seats: SeatPos[] = []
  let idx = 0
  for (let i = 0; i < top; i++)
    seats.push({ index: idx++, x: -halfW + (w * (i + 0.5)) / top, y: -halfH - GAP, side: 'top', angle: 0, flipped: false })
  for (let i = 0; i < right; i++)
    seats.push({ index: idx++, x: halfW + GAP, y: -halfH + (h * (i + 0.5)) / right, side: 'right', angle: 0, flipped: false })
  for (let i = 0; i < bottom; i++)
    seats.push({ index: idx++, x: halfW - (w * (i + 0.5)) / bottom, y: halfH + GAP, side: 'bottom', angle: 0, flipped: false })
  for (let i = 0; i < left; i++)
    seats.push({ index: idx++, x: -halfW - GAP, y: halfH - (h * (i + 0.5)) / left, side: 'left', angle: 0, flipped: false })

  return { seats, outline: { kind: 'rect', x: -halfW, y: -halfH, w, h }, viewBox: box(seats, labelWidth, false) }
}
