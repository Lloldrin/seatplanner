<script setup lang="ts">
import { ref } from 'vue'
import type { RuleKind } from '../stores/planner'
import { usePlannerStore } from '../stores/planner'

const store = usePlannerStore()

const newName = ref('')
const newGroup = ref('')
const bulkOpen = ref(false)
const bulkText = ref('')

const ruleA = ref('')
const ruleB = ref('')
const ruleKind = ref<RuleKind>('couple')

const KIND_LABELS: Record<RuleKind, string> = {
  couple: '💍 couple',
  together: '🤝 keep together',
  apart: '⚡ keep apart',
}

function submitRule() {
  if (ruleA.value && ruleB.value && ruleA.value !== ruleB.value) {
    store.addRule(ruleA.value, ruleB.value, ruleKind.value)
    ruleB.value = ''
  }
}

function guestName(id: string): string {
  return store.guests.find((g) => g.id === id)?.name ?? '?'
}

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
        class="input min-w-48 flex-1"
        autofocus
      />
      <input
        v-model="newGroup"
        type="text"
        list="group-suggestions"
        placeholder="Group (optional)"
        class="input w-44"
      />
      <button type="submit" class="btn btn-primary">Add</button>
      <button type="button" class="btn btn-secondary" @click="bulkOpen = !bulkOpen">
        Bulk add
      </button>
    </form>

    <datalist id="group-suggestions">
      <option v-for="group in store.groups" :key="group" :value="group" />
    </datalist>

    <div v-if="bulkOpen" class="card mt-3">
      <textarea
        v-model="bulkText"
        rows="6"
        placeholder="One name per line — paste your whole guest list"
        class="input"
      />
      <button class="btn btn-primary self-start" @click="submitBulk">Add all</button>
    </div>

    <div v-if="store.groups.length" class="mt-4 flex flex-wrap gap-2">
      <span
        v-for="group in store.groups"
        :key="group"
        class="tag tag-neutral gap-1.5"
      >
        <span class="size-2 rounded-full" :style="{ backgroundColor: store.groupColor(group) }" />
        {{ group }} · <span class="tnum">{{ groupCount(group) }}</span>
      </span>
    </div>

    <p v-if="!store.guests.length" class="text-muted mt-12 text-center">
      No guests yet — add your first guest above, or paste a whole list with “Bulk add”.
    </p>

    <ul v-else class="mt-4 list-none rounded-[var(--radius-md)] border border-[var(--color-divider)] p-0">
      <li
        v-for="guest in store.guests"
        :key="guest.id"
        class="flex flex-wrap items-center gap-2 border-b border-[var(--color-divider)] px-3 py-2 last:border-0"
      >
        <span
          class="size-2.5 shrink-0 rounded-full"
          :style="{ backgroundColor: store.groupColor(guest.group) ?? 'var(--color-neutral-300)' }"
        />
        <input
          :value="guest.name"
          class="input w-44 min-h-0 border-0 px-1.5 py-1"
          @change="store.updateGuest(guest.id, { name: ($event.target as HTMLInputElement).value })"
        />
        <input
          :value="guest.group ?? ''"
          list="group-suggestions"
          placeholder="group"
          class="input text-muted w-36 min-h-0 border-0 px-1.5 py-1"
          @change="store.updateGuest(guest.id, { group: ($event.target as HTMLInputElement).value })"
        />
        <input
          :value="guest.notes ?? ''"
          placeholder="notes"
          class="input text-muted min-w-32 flex-1 min-h-0 border-0 px-1.5 py-1"
          @change="store.updateGuest(guest.id, { notes: ($event.target as HTMLInputElement).value })"
        />
        <span class="text-muted text-xs">
          {{ store.tableByGuestId.get(guest.id)?.name ?? '' }}
        </span>
        <button
          class="btn btn-ghost px-1.5 py-0"
          title="Remove guest"
          @click="store.removeGuest(guest.id)"
        >
          ✕
        </button>
      </li>
    </ul>

    <details v-if="store.guests.length >= 2" class="card mt-6" :open="store.rules.length > 0">
      <summary class="card-title cursor-pointer">
        Rules
        <span class="text-muted tnum">· {{ store.rules.length }}</span>
        <span class="text-muted ml-2 font-[var(--font-body)] text-xs">
          couples & keep together/apart — warnings show when the seating breaks them
        </span>
      </summary>
      <form class="mt-3 flex flex-wrap items-center gap-2" @submit.prevent="submitRule">
        <select v-model="ruleA" class="input w-auto">
          <option value="" disabled>Guest…</option>
          <option v-for="g in store.guests" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
        <select v-model="ruleKind" class="input w-auto">
          <option v-for="(label, kind) in KIND_LABELS" :key="kind" :value="kind">{{ label }}</option>
        </select>
        <select v-model="ruleB" class="input w-auto">
          <option value="" disabled>Guest…</option>
          <option v-for="g in store.guests" :key="g.id" :value="g.id" :disabled="g.id === ruleA">
            {{ g.name }}
          </option>
        </select>
        <button type="submit" class="btn btn-primary">Add rule</button>
      </form>
      <ul v-if="store.rules.length" class="m-0 mt-3 list-none p-0">
        <li
          v-for="rule in store.rules"
          :key="rule.id"
          class="flex items-center gap-2 border-b border-[var(--color-divider)] py-1.5 text-[13px] last:border-0"
        >
          <span>{{ guestName(rule.a) }}</span>
          <span class="text-muted italic">{{ KIND_LABELS[rule.kind] }}</span>
          <span>{{ guestName(rule.b) }}</span>
          <button
            class="btn btn-ghost ml-auto px-1.5 py-0"
            title="Remove rule"
            @click="store.removeRule(rule.id)"
          >
            ✕
          </button>
        </li>
      </ul>
    </details>
  </div>
</template>
