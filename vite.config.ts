import path from 'path';
import { handleAvailability } from './server/businessCentral';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss(), {
        name: 'business-central-api',
        configureServer(server) {
          server.middlewares.use('/api/item-availabilities', (req, res) => { void handleAvailability(req, res, env); });
        }
      }],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          'xlsx': 'xlsx-js-style'
        }
      }
    };
});
