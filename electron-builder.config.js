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
    runAfterFinish: false
  },

  mac: {
    target: ['dmg'],
    icon: 'build/icons/posclinic-icon.icns',
    category: 'public.app-category.medical'
  },

  linux: {
    target: ['AppImage', 'deb'],
    icon: 'build/icons',
    category: 'Office'
  },

  publish: {
    provider: 'generic',
    url: 'https://posclinic.bobur-dev.uz/releases/',
    channel: 'latest'
  }
};
