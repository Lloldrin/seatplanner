<script setup lang="ts">
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { onMounted, onUnmounted, ref } from 'vue'
import { usePlannerStore } from './stores/planner'

const store = usePlannerStore()

const tabs = [
  { to: '/', label: 'Guests' },
  { to: '/arrange', label: 'Arrange' },
  { to: '/circle', label: 'Circle' },
  { to: '/tables', label: 'Tables' },
  { to: '/print', label: 'Print' },
]

const importInput = ref<HTMLInputElement | null>(null)
const shareCopied = ref(false)

function exportPlan() {
  const blob = new Blob([store.exportState()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `seatplanner-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function importPlan(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const text = await file.text()
  const accepted = confirm(
    `Replace the current plan (${store.guests.length} guests, ${store.tables.length} tables) with the contents of “${file.name}”?`,
  )
  if (!accepted) return
  if (!store.importState(text)) {
    alert(`Could not import “${file.name}” — it doesn't look like a Seat Planner export.`)
  }
}

async function sharePlan() {
  const url = `${location.origin}/#plan=${compressToEncodedURIComponent(store.exportState())}`
  try {
    await navigator.clipboard.writeText(url)
    shareCopied.value = true
    setTimeout(() => (shareCopied.value = false), 2000)
  } catch {
    prompt('Copy this link:', url)
  }
}

function restoreSnapshot(key: string, takenAt: Date) {
  if (confirm(`Restore the backup from ${takenAt.toLocaleString()}? (You can undo this.)`)) {
    store.restoreSnapshot(key)
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey)) return
  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
  const key = event.key.toLowerCase()
  if (key === 'z') {
    event.preventDefault()
    void (event.shiftKey ? store.redo() : store.undo())
  } else if (key === 'y') {
    event.preventDefault()
    void store.redo()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  const match = location.hash.match(/^#plan=(.+)$/)
  if (match?.[1]) {
    history.replaceState(null, '', location.pathname)
    const json = decompressFromEncodedURIComponent(match[1])
    const shared = json ? JSON.parse(json) : null
    if (
      json &&
      confirm(
        `Load the shared plan (${shared?.guests?.length ?? '?'} guests)? This replaces your current plan — a backup of it is kept under Backups.`,
      )
    ) {
      if (!store.importState(json)) alert('The shared link seems to be broken.')
    }
  }
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-6xl flex-col px-4">
    <header class="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-stone-200 py-4 print:hidden">
      <h1 class="text-xl font-semibold tracking-tight">💍 Seat Planner</h1>
      <nav class="flex gap-1">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="rounded-full px-4 py-1.5 text-sm font-medium text-stone-500 transition hover:text-stone-800"
          exact-active-class="bg-stone-800 !text-white"
        >
          {{ tab.label }}
        </RouterLink>
      </nav>
      <p v-if="store.guests.length" class="ml-auto text-sm text-stone-500">
        {{ store.guests.length }} guests ·
        {{ store.seatedCount }} seated ·
        {{ store.totalSeats }} seats
      </p>
      <div class="flex flex-wrap gap-1" :class="{ 'ml-auto': !store.guests.length }">
        <button
          class="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-35"
          :disabled="!store.canUndo"
          title="Undo (Ctrl+Z)"
          @click="store.undo()"
        >
          ↶ Undo
        </button>
        <button
          class="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-35"
          :disabled="!store.canRedo"
          title="Redo (Ctrl+Shift+Z)"
          @click="store.redo()"
        >
          ↷
        </button>
        <button
          class="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 transition hover:bg-stone-100"
          title="Download the plan as a JSON file"
          @click="exportPlan"
        >
          Export
        </button>
        <button
          class="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 transition hover:bg-stone-100"
          title="Load a previously exported plan"
          @click="importInput?.click()"
        >
          Import
        </button>
        <button
          class="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs transition hover:bg-stone-100"
          :class="shareCopied ? 'border-emerald-400 text-emerald-600' : 'border-stone-300 text-stone-600'"
          title="Copy a link that opens this plan on another device"
          @click="sharePlan"
        >
          {{ shareCopied ? 'Link copied!' : 'Share' }}
        </button>
        <details class="relative">
          <summary
            class="cursor-pointer list-none rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 transition hover:bg-stone-100"
            title="Automatic backups of earlier states"
          >
            Backups
          </summary>
          <div class="absolute right-0 z-10 mt-1 w-72 rounded-lg border border-stone-200 bg-white p-2 shadow-lg">
            <p v-if="!store.snapshots.length" class="px-1 py-2 text-xs text-stone-400">
              No backups yet — one is saved automatically every few minutes of editing, and
              before imports and “Assign to tables”.
            </p>
            <ul v-else class="divide-y divide-stone-100">
              <li
                v-for="snap in store.snapshots"
                :key="snap.key"
                class="flex items-center gap-2 px-1 py-1.5 text-xs"
              >
                <span class="flex-1 text-stone-600">
                  {{ snap.takenAt.toLocaleString() }}
                  <span class="text-stone-400"> · {{ snap.guests }} guests, {{ snap.seated }} seated</span>
                </span>
                <button
                  class="rounded border border-stone-300 px-2 py-0.5 text-stone-600 transition hover:bg-stone-100"
                  @click="restoreSnapshot(snap.key, snap.takenAt)"
                >
                  Restore
                </button>
              </li>
            </ul>
          </div>
        </details>
        <input
          ref="importInput"
          type="file"
          accept=".json,application/json"
          class="hidden"
          @change="importPlan"
        />
      </div>
    </header>
    <main class="flex-1 py-6">
      <RouterView />
    </main>
  </div>
</template>
