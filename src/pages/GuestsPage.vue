<script setup lang="ts">
import { ref } from 'vue'
import { usePlannerStore } from '../stores/planner'

const store = usePlannerStore()

const newName = ref('')
const newGroup = ref('')
const bulkOpen = ref(false)
const bulkText = ref('')

function submitGuest() {
  if (store.addGuest(newName.value, newGroup.value)) {
    newName.value = ''
  }
}

function submitBulk() {
  const added = store.addGuestsBulk(bulkText.value)
  if (added > 0) {
    bulkText.value = ''
    bulkOpen.value = false
  }
}

function groupCount(group: string): number {
  return store.guests.filter((g) => g.group === group).length
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <form class="flex flex-wrap gap-2" @submit.prevent="submitGuest">
      <input
        v-model="newName"
        type="text"
        placeholder="Guest name…"
        class="min-w-48 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
        autofocus
      />
      <input
        v-model="newGroup"
        type="text"
        list="group-suggestions"
        placeholder="Group (optional)"
        class="w-44 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
      />
      <button
        type="submit"
        class="rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
      >
        Add
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-600 transition hover:bg-stone-100"
        @click="bulkOpen = !bulkOpen"
      >
        Bulk add
      </button>
    </form>

    <datalist id="group-suggestions">
      <option v-for="group in store.groups" :key="group" :value="group" />
    </datalist>

    <div v-if="bulkOpen" class="mt-3 rounded-lg border border-stone-200 bg-white p-3">
      <textarea
        v-model="bulkText"
        rows="6"
        placeholder="One name per line — paste your whole guest list"
        class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
      />
      <button
        class="mt-2 rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
        @click="submitBulk"
      >
        Add all
      </button>
    </div>

    <div v-if="store.groups.length" class="mt-4 flex flex-wrap gap-2">
      <span
        v-for="group in store.groups"
        :key="group"
        class="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600"
      >
        <span class="size-2 rounded-full" :style="{ backgroundColor: store.groupColor(group) }" />
        {{ group }} · {{ groupCount(group) }}
      </span>
    </div>

    <p v-if="!store.guests.length" class="mt-12 text-center text-stone-400">
      No guests yet — add your first guest above, or paste a whole list with “Bulk add”.
    </p>

    <ul v-else class="mt-4 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
      <li
        v-for="guest in store.guests"
        :key="guest.id"
        class="flex flex-wrap items-center gap-2 px-3 py-2"
      >
        <span
          class="size-2.5 shrink-0 rounded-full"
          :style="{ backgroundColor: store.groupColor(guest.group) ?? '#d6d3d1' }"
        />
        <input
          :value="guest.name"
          class="w-44 rounded px-1.5 py-1 text-sm font-medium focus:bg-stone-50 focus:outline-none"
          @change="store.updateGuest(guest.id, { name: ($event.target as HTMLInputElement).value })"
        />
        <input
          :value="guest.group ?? ''"
          list="group-suggestions"
          placeholder="group"
          class="w-36 rounded px-1.5 py-1 text-sm text-stone-500 focus:bg-stone-50 focus:outline-none"
          @change="store.updateGuest(guest.id, { group: ($event.target as HTMLInputElement).value })"
        />
        <input
          :value="guest.notes ?? ''"
          placeholder="notes"
          class="min-w-32 flex-1 rounded px-1.5 py-1 text-sm text-stone-400 focus:bg-stone-50 focus:outline-none"
          @change="store.updateGuest(guest.id, { notes: ($event.target as HTMLInputElement).value })"
        />
        <span class="text-xs text-stone-400">
          {{ store.tableByGuestId.get(guest.id)?.name ?? '' }}
        </span>
        <button
          class="rounded px-1.5 text-stone-300 transition hover:text-red-500"
          title="Remove guest"
          @click="store.removeGuest(guest.id)"
        >
          ✕
        </button>
      </li>
    </ul>
  </div>
</template>
