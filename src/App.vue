<script setup lang="ts">
import { ref } from 'vue'
import { usePlannerStore } from './stores/planner'

const store = usePlannerStore()

const tabs = [
  { to: '/', label: 'Guests' },
  { to: '/circle', label: 'Circle' },
  { to: '/tables', label: 'Tables' },
]

const importInput = ref<HTMLInputElement | null>(null)

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
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-6xl flex-col px-4">
    <header class="flex flex-wrap items-center gap-6 border-b border-stone-200 py-4">
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
        {{ store.guests.length - store.unassignedGuests.length }} seated ·
        {{ store.totalSeats }} seats
      </p>
      <div class="flex gap-1" :class="{ 'ml-auto': !store.guests.length }">
        <button
          class="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-600 transition hover:bg-stone-100"
          title="Download the plan as a JSON file"
          @click="exportPlan"
        >
          Export
        </button>
        <button
          class="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-600 transition hover:bg-stone-100"
          title="Load a previously exported plan"
          @click="importInput?.click()"
        >
          Import
        </button>
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
