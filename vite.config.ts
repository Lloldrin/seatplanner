import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this project from the /seatplanner/ sub-path. Override
  // with BASE_PATH when the repo is renamed or a custom domain is used
  // (e.g. BASE_PATH=/ for a user site or custom domain).
  base: process.env.BASE_PATH ?? '/seatplanner/',
  plugins: [vue(), tailwindcss()],
})
