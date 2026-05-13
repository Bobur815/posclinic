# POSCLINIC

Offline-first clinic management POS system built with Electron, React, NestJS, and Prisma.

## Architecture

```
src/
├── main/          # Electron main process (IPC handlers, SQLite, sync)
├── renderer/      # React frontend (UI, stores, i18n)
├── server/        # NestJS backend (REST API, PostgreSQL)
└── shared/        # Shared TypeScript types
```

The POS terminal runs fully offline using a local **SQLite** database and periodically syncs with a central **NestJS** server backed by **PostgreSQL**.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 40 |
| Frontend | React 18, React Router, Zustand, styled-components |
| Charts | Recharts |
| Backend | NestJS 10, Passport JWT |
| ORM | Prisma 5 (SQLite for local, PostgreSQL for server) |
| Build | electron-vite, electron-builder |
| Languages | Uzbek, Russian (i18next) |

## Prerequisites

- Node.js 20+
- npm 9+

## Getting Started

```bash
# Install dependencies
npm install

# Generate the SQLite Prisma client
npm run prisma:generate:sqlite

# Push the SQLite schema to the local database
npm run prisma:push:sqlite

# Start the POS desktop app (dev mode)
npm run dev:pos

# Start the NestJS server (dev mode)
npm run dev:server
```

## Environment Variables

Create a `.env` file in the project root:

```env
# SQLite (local POS terminal)
SQLITE_DATABASE_URL="file:./posclinic.db"

# PostgreSQL (central server)
DATABASE_URL="postgresql://user:password@localhost:5432/posclinic"

# App config
VPS_API_URL="https://your-server.com"
TERMINAL_ID="terminal-001"
CLINIC_ID="clinic-001"
CLINIC_NAME="My Clinic"
JWT_SECRET="your-jwt-secret"
SYNC_INTERVAL_MS=30000
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev:pos` | Start Electron POS app in dev mode |
| `npm run dev:server` | Start NestJS server in watch mode |
| `npm run build:pos` | Build and package the Electron app |
| `npm run build:server` | Build the NestJS server |
| `npm run prisma:generate:sqlite` | Generate Prisma client for SQLite |
| `npm run prisma:push:sqlite` | Push SQLite schema to local database |
| `npm run prisma:migrate:dev` | Run PostgreSQL migrations (dev) |
| `npm run prisma:migrate:deploy` | Run PostgreSQL migrations (prod) |
| `npm run prisma:seed` | Seed the database |
| `npm run prisma:studio:sqlite` | Open Prisma Studio for local SQLite |
| `npm run lint` | Lint TypeScript source files |
| `npm run format` | Format source files with Prettier |

## Features

- **Patient management** — registration, search, medical history
- **Doctor management** — profiles, specialties
- **Appointments** — scheduling, status tracking, checkout
- **Services & pricing** — configurable service catalog
- **Payments** — cash, card, transfer, insurance
- **Daily reports** — revenue and appointment summaries
- **Offline-first** — fully functional without internet; syncs when connection is available
- **Multi-language** — Uzbek and Russian UI

## User Roles

`SUPER_ADMIN` · `CLINIC_ADMIN` · `DOCTOR` · `NURSE` · `RECEPTIONIST`

## Building for Distribution

```bash
# Windows installer (.exe)
npm run build:pos
# Output: dist/POSCLINIC-Setup-<version>.exe
```

Targets: Windows (NSIS), macOS (DMG), Linux (AppImage, deb).

## License

UNLICENSED — proprietary software. Copyright © 2026 Bobur.
