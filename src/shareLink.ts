import { decompressFromEncodedURIComponent } from 'lz-string'
import type { Guest, Rule, RuleKind, Table } from './stores/planner'

/**
 * Share links carry the whole plan in the URL hash, so size matters. The
 * compact format (`#p2=`) drops every id — random UUIDs barely compress and
 * each guest's id repeats in seats and rules — and refers to guests by list
 * position instead. Rows are positional arrays, group names are listed once,
 * and the JSON is deflated with the browser's built-in CompressionStream.
 * Roughly 15× shorter than the original lz-string links (`#plan=`), which are
 * still accepted.
 *
 *   { v: 2,
 *     gr: [groupName, …],
 *     g:  [[name, group#?, notes?], …]           group# is 1-based, 0 = none
 *     t:  [[name, capacity, seats, shape?], …]   seats: 1-based guest #, 0 = empty,
 *                                                trailing empties trimmed;
 *                                                shape: 'o' round | ['s'|'r', t, r, b, l]
 *     r:  [[guest#, guest#, kind#], …] }         kind# indexes RULE_KINDS
 */

const RULE_KINDS: RuleKind[] = ['couple', 'together', 'apart']

type CompactGuest = [string, number?, string?]
type CompactShape = 'o' | ['s' | 'r', number, number, number, number]
type CompactTable = [string, number, number[], CompactShape?]
type CompactRule = [number, number, number]

interface CompactPlan {
  v: 2
  gr: string[]
  g: CompactGuest[]
  t: CompactTable[]
  r: CompactRule[]
}

interface Plan {
  guests: Guest[]
  tables: Table[]
  rules: Rule[]
}

function toCompact({ guests, tables, rules }: Plan): CompactPlan {
  const groups: string[] = []
  const guestNo = new Map(guests.map((g, i) => [g.id, i + 1]))

  const g = guests.map((guest): CompactGuest => {
    let group = 0
    if (guest.group) {
      group = groups.indexOf(guest.group) + 1 || groups.push(guest.group)
    }
    if (guest.notes) return [guest.name, group, guest.notes]
    return group ? [guest.name, group] : [guest.name]
  })

  const t = tables.map((table): CompactTable => {
    const seats = table.seats.map((id) => (id ? (guestNo.get(id) ?? 0) : 0))
    while (seats.length && seats[seats.length - 1] === 0) seats.pop()
    const row: CompactTable = [table.name, table.capacity, seats]
    const shape = table.shape
    if (shape?.kind === 'round') row.push('o')
    else if (shape?.sides) row.push([shape.kind === 'square' ? 's' : 'r', ...shape.sides])
    return row
  })

  const r = rules.map((rule): CompactRule => [
    guestNo.get(rule.a) ?? 0,
    guestNo.get(rule.b) ?? 0,
    RULE_KINDS.indexOf(rule.kind),
  ])

  return { v: 2, gr: groups, g, t, r }
}

/** Rebuild the regular export shape with fresh ids; the store validates it on import. */
function fromCompact(plan: CompactPlan): string {
  const guests: Guest[] = plan.g.map(([name, group, notes]) => {
    const guest: Guest = { id: crypto.randomUUID(), name }
    const groupName = group ? plan.gr[group - 1] : undefined
    if (groupName) guest.group = groupName
    if (notes) guest.notes = notes
    return guest
  })
  const idOf = (n: number) => guests[n - 1]?.id ?? null

  const tables = plan.t.map(([name, capacity, seats, shape]) => ({
    id: crypto.randomUUID(),
    name,
    capacity,
    seats: seats.map(idOf),
    shape:
      shape === 'o'
        ? { kind: 'round' }
        : shape
          ? { kind: shape[0] === 's' ? 'square' : 'rectangle', sides: shape.slice(1) }
          : undefined,
  }))

  const rules = plan.r.map(([a, b, kind]) => ({
    id: crypto.randomUUID(),
    a: idOf(a),
    b: idOf(b),
    kind: RULE_KINDS[kind],
  }))

  return JSON.stringify({ version: 1, guests, tables, rules })
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/** The URL hash (`#p2=…`) that carries `plan`. */
export async function encodeShareHash(plan: Plan): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(toCompact(plan)))
  return `#p2=${toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`
}

/**
 * Plan JSON (the export format) from a share-link hash, compact or legacy.
 * Null when the hash isn't a share link; throws when it is one but is corrupt.
 */
export async function decodeShareHash(hash: string): Promise<string | null> {
  const compact = hash.match(/^#p2=(.+)$/)?.[1]
  if (compact) {
    const bytes = await pipe(fromBase64Url(compact), new DecompressionStream('deflate-raw'))
    const plan = JSON.parse(new TextDecoder().decode(bytes)) as CompactPlan
    if (plan?.v !== 2) throw new Error('Unknown share link version')
    return fromCompact(plan)
  }
  const legacy = hash.match(/^#plan=(.+)$/)?.[1]
  if (legacy) {
    const json = decompressFromEncodedURIComponent(legacy)
    if (!json) throw new Error('Corrupt share link')
    return json
  }
  return null
}
