import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://lloldrin.github.io/seatplanner/ on GitHub Pages.
  base: '/seatplanner/',
  plugins: [vue(), tailwindcss()],
})
