/**
 * Electron Builder Configuration
 * @see https://www.electron.build/configuration/configuration
 */
module.exports = {
  appId: 'uz.bobur-dev.posclinic',
  productName: 'POSCLINIC',
  artifactName: 'POSCLINIC-Setup-${version}.exe',
  copyright: 'Copyright © 2026 Bobur',

  directories: {
    output: 'dist',
    buildResources: 'build'
  },

  asar: false,

  files: [
    'dist-electron/**/*',
    'dist-renderer/**/*',
    'src/generated/prisma-sqlite/**/*',
    'build/icons/**/*'
  ],

  extraResources: [
    {
      from: 'prisma',
      to: 'prisma',
      filter: ['**/*']
    },
    {
      from: 'build/icons',
      to: 'icons',
      filter: ['**/*']
    }
  ],

  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      }
    ],
    icon: 'build/icons/posclinic-icon.ico',
    artifactName: 'POSCLINIC-Setup-${version}.exe'
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'POSCLINIC',
    installerIcon: 'build/icons/posclinic-icon.ico',
    uninstallerIcon: 'build/icons/posclinic-icon.ico',
    installerHeaderIcon: 'build/icons/posclinic-icon.ico',
    runAfterFinish: false,
    // The clinic's data (%APPDATA%\POSCLINIC: patient database, licence, logs) survives an
    // uninstall and every upgrade; installing a newer version over an older one is the update path.
    deleteAppDataOnUninstall: false
  },

  linux: {
    target: ['AppImage', 'deb'],
    icon: 'build/icons',
    category: 'Office'
  },

  // The build writes latest.yml + .blockmap for this feed and app-update.yml into the app;
  // `npm run deploy:pos` uploads them (scripts/upload-release.mjs). Keep in sync with
  // UPDATE_FEED_URL in src/main/updater/updater.ts. Served by the posgro panel's /releases/ alias.
  publish: {
    provider: 'generic',
    url: 'https://panel.posgro.uz/releases/posclinic/',
    channel: 'latest'
  }
};
