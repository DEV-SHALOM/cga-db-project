import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      tailwindcss(),
      react()
    ],
    server: {
      host: '0.0.0.0',
      port: 5000,
      allowedHosts: true
    },
    define: {
      'import.meta.env.VITE_AI_INTEGRATIONS_OPENAI_API_KEY': JSON.stringify(env.AI_INTEGRATIONS_OPENAI_API_KEY),
      'import.meta.env.VITE_AI_INTEGRATIONS_OPENAI_BASE_URL': JSON.stringify(env.AI_INTEGRATIONS_OPENAI_BASE_URL),
    }
  }
})
