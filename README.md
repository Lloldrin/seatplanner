# 💍 Seat Planner

A wedding seating planner that runs entirely in the browser. Enter your guests,
arrange them in a circle to figure out who should sit near whom, then place
everyone on numbered seats at real tables — with rules, warnings, and a
printable plan for the venue.

No accounts, no server: all data lives in your browser's localStorage. Use
**Export** for file backups and **Share** to send the whole plan to someone
else as a link.

## The workflow

1. **Guests** — add everyone (bulk paste supported), tag them with groups
   ("bride's family", "colleagues" — each gets a color), add notes, and define
   rules: 💍 couples, 🤝 keep together, ⚡ keep apart.
2. **Arrange** — all guests in one free circle, no tables yet. Drag to reorder
   until the social order feels right, then hit **Assign to tables** to pour
   that order into seats.
3. **Circle** — the granular view: every table is a fixed arc of numbered
   seats (empty seats are hollow dots). Drag a guest onto an empty seat to
   move them, onto another guest to swap. Nobody ever shifts on their own.
4. **Tables** — the same seats as cards: click a guest, then a seat to place
   them. Capacity meters, unseated panel, and rule-violation warnings.
5. **Print** — a clean per-table seat list to hand to the venue.

Everything is undoable (`Ctrl+Z` / `Ctrl+Shift+Z`), rotating backups are kept
automatically (see **Backups** in the header), and both circle views support
find-a-guest highlighting plus wheel/button zoom with panning.

## Running locally

Requires [Node.js](https://nodejs.org) 20+ and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm dev        # dev server at http://localhost:5173
```

Other commands:

```sh
pnpm build      # type-check (vue-tsc) and build to dist/
pnpm preview    # serve the production build locally
```

The production build in `dist/` is fully static — it can be hosted on any
static file host (GitHub Pages, Netlify, …).

## Tech

- [Vue 3](https://vuejs.org) (`<script setup>` + TypeScript) with
  [Pinia](https://pinia.vuejs.org) and [Vue Router](https://router.vuejs.org)
- [Vite](https://vite.dev) and [Tailwind CSS 4](https://tailwindcss.com)
- The circles are hand-rolled SVG: custom pointer-event dragging in SVG user
  space (so it stays exact while zoomed), no drag-and-drop library
- Persistence is a single versioned localStorage key with a sanitizing
  parser that also migrates older data shapes; share links compress the same
  JSON with [lz-string](https://github.com/pieroxy/lz-string) into the URL hash

## Data & privacy

Your guest list never leaves the browser. The only ways data moves are the
ones you trigger yourself: **Export** (downloads a JSON file), **Share**
(encodes the plan into a link — anyone with the link can import it), and
**Print**.
