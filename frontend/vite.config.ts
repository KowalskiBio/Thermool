import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // `npm run dev` serves the UI on its own port; the API lives on the
    // Rust server (`cargo run --release`, port 5070).
    proxy: { '/api': 'http://127.0.0.1:5070' },
  },
})
