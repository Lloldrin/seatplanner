import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'guests', component: () => import('./pages/GuestsPage.vue') },
    { path: '/circle', name: 'circle', component: () => import('./pages/CirclePage.vue') },
    { path: '/tables', name: 'tables', component: () => import('./pages/TablesPage.vue') },
  ],
})
