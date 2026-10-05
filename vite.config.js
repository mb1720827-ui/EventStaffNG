import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks cache across deploys of app code.
        codeSplitting: {
          groups: [
            { name: 'supabase', test: /node_modules[\/]@supabase/ },
            { name: 'react', test: /node_modules[\/](react|react-dom|react-router|scheduler)/ },
          ],
        },
      },
    },
  },
})
