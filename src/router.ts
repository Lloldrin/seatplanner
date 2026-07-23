import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'guests', component: () => import('./pages/GuestsPage.vue') },
    { path: '/arrange', name: 'arrange', component: () => import('./pages/ArrangePage.vue') },
    { path: '/circle', name: 'circle', component: () => import('./pages/CirclePage.vue') },
    { path: '/tables', name: 'tables', component: () => import('./pages/TablesPage.vue') },
    { path: '/seatmap', name: 'seatmap', component: () => import('./pages/SeatMapPage.vue') },
    { path: '/print', name: 'print', component: () => import('./pages/PrintPage.vue') },
  ],
})
