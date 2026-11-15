import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode || 'pos', process.cwd(), '')

  // Baked into the bundle and extractable: never add secrets here. POSCLINIC_API_URL is honoured
  // only by unpackaged (dev) builds (licenseApiUrl / serverApiUrl). POSCLINIC_SERVER_URL is the
  // posclinic cloud-sync server (src/main/sync/sync-service.ts).
  const APP_ENV_KEYS = ['POSCLINIC_API_URL', 'POSCLINIC_SERVER_URL']
  // Define every key (as `undefined` when unset) so renderer code like
  // `process.env.X ?? fallback` never references the missing `process` global.
  const envDefines = Object.fromEntries(
    APP_ENV_KEYS.map(k => [
      `process.env.${k}`,
      env[k] !== undefined ? JSON.stringify(env[k]) : 'undefined',
    ])
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
      define: envDefines,
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
