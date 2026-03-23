import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Repo: github.com/SWL713/night-watch → base: '/night-watch/'
export default defineConfig({
  plugins: [react()],
  base: '/night-watch/',
})
