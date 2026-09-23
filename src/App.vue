<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { decodeShareHash, encodeShareHash } from './shareLink'
import { usePlannerStore } from './stores/planner'

const store = usePlannerStore()
const router = useRouter()

const tabs = [
  { to: '/', label: 'Guests' },
  { to: '/arrange', label: 'Arrange' },
  { to: '/circle', label: 'Circle' },
  { to: '/tables', label: 'Tables' },
  { to: '/seatmap', label: 'Seat Map' },
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
  const hash = await encodeShareHash({ guests: store.guests, tables: store.tables, rules: store.rules })
  const url = `${location.origin}${import.meta.env.BASE_URL}${hash}`
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

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  const hash = location.hash
  if (!/^#(plan|p2)=/.test(hash)) return
  // Drop the plan from the address bar so a reload doesn't offer it again. Wait
  // for the router's initial navigation first: it rewrites the URL it started
  // with (hash included) when it settles, undoing any earlier cleanup.
  await router.isReady()
  await router.replace({ ...router.currentRoute.value, hash: '' })
  let json: string | null
  try {
    json = await decodeShareHash(hash)
  } catch {
    alert('The shared link seems to be broken.')
    return
  }
  if (!json) return
  const shared = JSON.parse(json)
  if (
    confirm(
      `Load the shared plan (${shared?.guests?.length ?? '?'} guests)? This replaces your current plan — a backup of it is kept under Backups.`,
    )
  ) {
    if (!store.importState(json)) alert('The shared link seems to be broken.')
  }
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-6xl flex-col px-4">
    <header class="nav flex-wrap gap-x-6 gap-y-2 px-0 print:hidden">
      <h1 class="nav-brand mb-0">Seat Planner</h1>
      <nav class="flex gap-4">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="text-muted border-b border-transparent py-1"
          exact-active-class="!border-[var(--color-accent)] !text-[var(--color-accent)]"
        >
          {{ tab.label }}
        </RouterLink>
      </nav>
      <p v-if="store.guests.length" class="text-muted tnum mb-0 ml-auto text-[13px]">
        {{ store.guests.length }} guests ·
        {{ store.seatedCount }} seated ·
        {{ store.totalSeats }} seats
      </p>
      <div class="flex flex-wrap gap-1" :class="{ 'ml-auto': !store.guests.length }">
        <button
          class="btn btn-secondary px-2 py-1 text-xs"
          :disabled="!store.canUndo"
          title="Undo (Ctrl+Z)"
          @click="store.undo()"
        >
          ↶ Undo
        </button>
        <button
          class="btn btn-secondary px-2 py-1 text-xs"
          :disabled="!store.canRedo"
          title="Redo (Ctrl+Shift+Z)"
          @click="store.redo()"
        >
          ↷
        </button>
        <button
          class="btn btn-secondary px-2 py-1 text-xs"
          title="Download the plan as a JSON file"
          @click="exportPlan"
        >
          Export
        </button>
        <button
          class="btn btn-secondary px-2 py-1 text-xs"
          title="Load a previously exported plan"
          @click="importInput?.click()"
        >
          Import
        </button>
        <button
          class="btn px-2 py-1 text-xs"
          :class="shareCopied ? 'btn-primary' : 'btn-secondary'"
          title="Copy a link that opens this plan on another device"
          @click="sharePlan"
        >
          {{ shareCopied ? 'Link copied!' : 'Share' }}
        </button>
        <details class="relative">
          <summary
            class="btn btn-secondary list-none px-2 py-1 text-xs"
            title="Automatic backups of earlier states"
          >
            Backups
          </summary>
          <div class="elev-lg absolute right-0 z-10 mt-1 w-72 rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)] p-2">
            <p v-if="!store.snapshots.length" class="text-muted mb-0 px-1 py-2 text-xs">
              No backups yet — one is saved automatically every few minutes of editing, and
              before imports and “Assign to tables”.
            </p>
            <ul v-else class="m-0 list-none p-0">
              <li
                v-for="snap in store.snapshots"
                :key="snap.key"
                class="flex items-center gap-2 border-b border-[var(--color-divider)] px-1 py-1.5 text-xs last:border-0"
              >
                <span class="tnum flex-1">
                  {{ snap.takenAt.toLocaleString() }}
                  <span class="text-muted"> · {{ snap.guests }} guests, {{ snap.seated }} seated</span>
                </span>
                <button
                  class="btn btn-secondary px-2 py-0.5 text-xs"
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
