import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode || 'pos', process.cwd(), '')

  const APP_ENV_KEYS = [
    'DATABASE_URL', 'VPS_API_URL', 'TERMINAL_ID', 'CLINIC_ID', 'CLINIC_NAME',
    'JWT_SECRET', 'SYNC_INTERVAL_MS',
  ]
  const envDefines = Object.fromEntries(
    APP_ENV_KEYS
      .filter(k => env[k] !== undefined)
      .map(k => [`process.env.${k}`, JSON.stringify(env[k])])
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    main: {
      build: {
        outDir: 'dist-electron/main',
        rollupOptions: {
          input: resolve(__dirname, 'src/main/index.ts'),
        },
      },
      define: envDefines,
    },

    preload: {
      build: {
        outDir: 'dist-electron/preload',
        rollupOptions: {
          input: resolve(__dirname, 'src/main/preload.ts'),
        },
      },
    },

    renderer: {
      publicDir: resolve(__dirname, 'public'),
      server: {
        port: 5175,
      },
      build: {
        outDir: 'dist-renderer'
      },
      plugins: [
        {
          name: 'remove-crossorigin',
          transformIndexHtml(html: string) {
            return html.replace(/ crossorigin/g, '')
          },
        },
      ],
      resolve: {
        alias: {
          '@renderer': resolve(__dirname, 'src/renderer'),
          '@shared': resolve(__dirname, 'src/shared'),
          '@main': resolve(__dirname, 'src/main'),
        }
      }
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
})
