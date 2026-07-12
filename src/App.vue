<script setup lang="ts">
import { usePlannerStore } from './stores/planner'

const store = usePlannerStore()

const tabs = [
  { to: '/', label: 'Guests' },
  { to: '/circle', label: 'Circle' },
  { to: '/tables', label: 'Tables' },
]
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
    </header>
    <main class="flex-1 py-6">
      <RouterView />
    </main>
  </div>
</template>
