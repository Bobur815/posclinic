# POSCLINIC - Complete Implementation Plan
## Place of Service Clinic Management System

---
PC-HSXEC6
## 🎯 Project Overview

### Brand Name: **POSCLINIC**
- **Tagline:** "Place of Service - Clinic Management Made Simple"
- **Domain:** `posclinic.bobur-dev.uz`
- **Target:** Dental clinics, small medical clinics
- **Architecture:** Separate from POSGRO, reusable patterns

---

## 🏗️ Architecture Decision

### ✅ RECOMMENDED: Separate Project with Shared Patterns

**Why Separate?**
1. **Different SQLite Schema** - Completely different local data model
2. **Different Electron App** - Clinic-specific features (patient records, prescriptions)
3. **Clean Separation** - No risk to POSGRO production database
4. **Independent Deployment** - Different release cycles
5. **Scalability** - Can grow independently

**What's Shared?**
1. **Architecture Patterns** - Same multi-tenant design
2. **Auth System** - Same JWT/NestJS approach
3. **Sync Mechanism** - Same offline-first sync pattern
4. **Code Style** - Same tech stack and conventions

---

## 📁 Project Structure

```
posclinic/                          # NEW separate repo
├── src/
│   ├── server/                     # NestJS backend (VPS)
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── clinics/            # Like stores
│   │   │   ├── patients/           # Like products
│   │   │   ├── appointments/       # Like sales
│   │   │   ├── services/           # Medical services
│   │   │   ├── doctors/
│   │   │   └── sync/
│   │   └── prisma/
│   │
│   ├── main/                       # Electron main process
│   │   ├── sync/                   # Clinic data sync
│   │   ├── database/               # SQLite client
│   │   ├── printer/                # Receipt/prescription printer
│   │   └── ipc/
│   │
│   ├── renderer/                   # Electron UI (Clinic terminal)
│   │   ├── pages/
│   │   │   ├── Dashboard/
│   │   │   ├── Patients/
│   │   │   ├── Appointments/
│   │   │   ├── Services/
│   │   │   └── Checkout/          # Service billing
│   │   └── components/
│   │
│   ├── web/                        # Browser admin dashboard
│   │   └── src/
│   │       └── pages/
│   │           ├── Admin/          # Super admin (manage clinics)
│   │           ├── Patients/
│   │           ├── Doctors/
│   │           ├── Reports/
│   │           └── Settings/
│   │
│   ├── shared/                     # Shared types
│   └── generated/
│       └── prisma-sqlite/
│
├── prisma/
│   ├── schema.prisma               # PostgreSQL (VPS)
│   └── schema.sqlite.prisma        # SQLite (Terminal)
│
└── package.json
```

---

## 🗄️ Database Schema

### PostgreSQL Schema (VPS) - `prisma/schema.prisma`

```prisma
// ========================================
// TENANT ROOT
// ========================================

model Clinic {
  id                String    @id @default(cuid())
  name              String
  address           String?
  phone             String?
  email             String?
  specialty         ClinicType @default(DENTAL)
  
  // Subscription
  plan              String     @default("free")  // free | basic | premium
  active            Boolean    @default(true)
  scheduledDeleteAt DateTime?
  
  // Relations
  users             User[]
  patients          Patient[]
  doctors           Doctor[]
  appointments      Appointment[]
  services          Service[]
  payments          Payment[]
  settings          ClinicSetting[]
  auditLogs         AuditLog[]
  terminalHeartbeats TerminalHeartbeat[]
  
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  
  @@map("clinics")
}

enum ClinicType {
  DENTAL
  GENERAL
  PEDIATRIC
  DERMATOLOGY
}

// ========================================
// USER & AUTH
// ========================================

model User {
  id        String    @id @default(cuid())
  clinicId  String?   @map("clinic_id")  // NULL for SUPER_ADMIN
  clinic    Clinic?   @relation(fields: [clinicId], references: [id])
  
  phone     String
  password  String
  fullName  String    @map("full_name")
  role      UserRole
  active    Boolean   @default(true)
  
  sessions  UserSession[]
  
  @@unique([clinicId, phone])  // Phone unique per clinic
  @@index([clinicId])
  @@map("users")
}

enum UserRole {
  SUPER_ADMIN     // Platform admin (clinicId = null)
  CLINIC_ADMIN    // Clinic owner/manager
  DOCTOR          // Medical doctor
  RECEPTIONIST    // Front desk
}

model UserSession {
  id           String   @id @default(cuid())
  userId       String   @map("user_id")
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  refreshToken String   @unique @map("refresh_token")
  expiresAt    DateTime @map("expires_at")
  revokedAt    DateTime? @map("revoked_at")
  
  @@index([userId])
  @@map("user_sessions")
}

// ========================================
// PATIENTS
// ========================================

model Patient {
  id          Int      @id @default(autoincrement())
  clinicId    String   @map("clinic_id")
  clinic      Clinic   @relation(fields: [clinicId], references: [id])
  
  // Identity
  patientCode String   @map("patient_code")  // P-001, P-002
  fullName    String   @map("full_name")
  phone       String
  birthDate   DateTime? @map("birth_date")
  gender      Gender?
  
  // Address
  address     String?
  city        String?
  
  // Medical info
  bloodType   String?   @map("blood_type")
  allergies   String?   // JSON array
  
  // Metadata
  notes       String?
  active      Boolean   @default(true)
  
  appointments Appointment[]
  
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  
  @@unique([clinicId, patientCode])
  @@unique([clinicId, phone])
  @@index([clinicId])
  @@index([clinicId, fullName])
  @@map("patients")
}

enum Gender {
  MALE
  FEMALE
  OTHER
}

// ========================================
// DOCTORS
// ========================================

model Doctor {
  id          String   @id @default(cuid())
  clinicId    String   @map("clinic_id")
  clinic      Clinic   @relation(fields: [clinicId], references: [id])
  
  fullName    String   @map("full_name")
  phone       String
  specialty   String
  licenseNo   String?  @map("license_no")
  active      Boolean  @default(true)
  
  appointments Appointment[]
  
  @@unique([clinicId, phone])
  @@index([clinicId])
  @@map("doctors")
}

// ========================================
// SERVICES (MEDICAL SERVICES)
// ========================================

model Service {
  id          Int      @id @default(autoincrement())
  clinicId    String   @map("clinic_id")
  clinic      Clinic   @relation(fields: [clinicId], references: [id])
  
  code        String
  name        String
  description String?
  price       Decimal  @db.Decimal(10, 2)
  duration    Int?     // minutes
  active      Boolean  @default(true)
  
  appointmentItems AppointmentItem[]
  
  @@unique([clinicId, code])
  @@index([clinicId])
  @@map("services")
}

// ========================================
// APPOINTMENTS (LIKE SALES)
// ========================================

model Appointment {
  id              String   @id @default(cuid())
  clinicId        String   @map("clinic_id")
  clinic          Clinic   @relation(fields: [clinicId], references: [id])
  
  // Business key for sync deduplication
  appointmentNumber String @map("appointment_number")  // A-001-20240512
  
  patientId       Int      @map("patient_id")
  patient         Patient  @relation(fields: [patientId], references: [id])
  
  doctorId        String   @map("doctor_id")
  doctor          Doctor   @relation(fields: [doctorId], references: [id])
  
  // Appointment info
  appointmentDate DateTime @map("appointment_date")
  status          AppointmentStatus @default(SCHEDULED)
  
  // Financial
  totalAmount     Decimal  @db.Decimal(10, 2) @map("total_amount")
  paidAmount      Decimal  @db.Decimal(10, 2) @default(0) @map("paid_amount")
  paymentStatus   PaymentStatus @default(PENDING) @map("payment_status")
  
  // Sync
  synced          Boolean  @default(false)
  syncedAt        DateTime? @map("synced_at")
  
  // Relations
  items           AppointmentItem[]
  payments        Payment[]
  
  // Metadata
  notes           String?
  diagnosis       String?
  prescription    String?  // JSON
  
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  
  @@unique([clinicId, appointmentNumber])  // Deduplication key
  @@index([clinicId])
  @@index([clinicId, patientId])
  @@index([synced])
  @@map("appointments")
}

enum AppointmentStatus {
  SCHEDULED
  COMPLETED
  CANCELLED
  NO_SHOW
}

enum PaymentStatus {
  PENDING
  PARTIAL
  PAID
  REFUNDED
}

model AppointmentItem {
  id            Int         @id @default(autoincrement())
  appointmentId String      @map("appointment_id")
  appointment   Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  
  serviceId     Int         @map("service_id")
  service       Service     @relation(fields: [serviceId], references: [id])
  
  quantity      Decimal     @db.Decimal(10, 3) @default(1)
  price         Decimal     @db.Decimal(10, 2)
  total         Decimal     @db.Decimal(10, 2)
  
  notes         String?
  
  @@index([appointmentId])
  @@map("appointment_items")
}

// ========================================
// PAYMENTS
// ========================================

model Payment {
  id            String      @id @default(cuid())
  clinicId      String      @map("clinic_id")
  clinic        Clinic      @relation(fields: [clinicId], references: [id])
  
  appointmentId String?     @map("appointment_id")
  appointment   Appointment? @relation(fields: [appointmentId], references: [id])
  
  amount        Decimal     @db.Decimal(10, 2)
  method        PaymentMethod
  status        PaymentStatus @default(PAID)
  
  // Metadata
  transactionId String?     @map("transaction_id")
  notes         String?
  
  createdAt DateTime @default(now()) @map("created_at")
  
  @@index([clinicId])
  @@index([appointmentId])
  @@map("payments")
}

enum PaymentMethod {
  CASH
  CARD
  TRANSFER
  INSURANCE
}

// ========================================
// SETTINGS & SYSTEM
// ========================================

model ClinicSetting {
  id        String @id @default(cuid())
  clinicId  String @map("clinic_id")
  clinic    Clinic @relation(fields: [clinicId], references: [id])
  
  key       String
  value     String
  
  @@unique([clinicId, key])
  @@map("clinic_settings")
}

model AuditLog {
  id        String   @id @default(cuid())
  clinicId  String?  @map("clinic_id")
  clinic    Clinic?  @relation(fields: [clinicId], references: [id])
  
  userId    String   @map("user_id")
  action    String
  entity    String
  entityId  String   @map("entity_id")
  changes   String?  // JSON
  
  createdAt DateTime @default(now()) @map("created_at")
  
  @@index([clinicId])
  @@index([userId])
  @@map("audit_logs")
}

model TerminalHeartbeat {
  id         String   @id @default(cuid())
  clinicId   String   @map("clinic_id")
  clinic     Clinic   @relation(fields: [clinicId], references: [id])
  
  terminalId String   @map("terminal_id")
  version    String
  lastSeen   DateTime @map("last_seen")
  
  @@unique([clinicId, terminalId])
  @@index([clinicId])
  @@map("terminal_heartbeats")
}
```

---

### SQLite Schema (Terminal) - `prisma/schema.sqlite.prisma`

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./posclinic.db"
}

generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma-sqlite"
}

// ========================================
// LOCAL CONFIG (SINGLE TENANT)
// ========================================

model LocalConfig {
  id         String   @id @default("config")
  clinicId   String   @map("clinic_id")
  clinicName String   @map("clinic_name")
  terminalId String   @map("terminal_id")
  apiUrl     String   @map("api_url")
  lastSync   DateTime @default(now()) @map("last_sync")
  
  @@map("local_config")
}

// ========================================
// PATIENTS (CACHED FROM SERVER)
// ========================================

model Patient {
  id          Int      @id
  patientCode String   @unique @map("patient_code")
  fullName    String   @map("full_name")
  phone       String   @unique
  birthDate   String?  @map("birth_date")  // ISO date string
  gender      String?
  bloodType   String?  @map("blood_type")
  allergies   String?  // JSON
  active      Boolean  @default(true)
  
  @@map("patients")
}

// ========================================
// DOCTORS (CACHED FROM SERVER)
// ========================================

model Doctor {
  id        String  @id
  fullName  String  @map("full_name")
  phone     String  @unique
  specialty String
  active    Boolean @default(true)
  
  @@map("doctors")
}

// ========================================
// SERVICES (CACHED FROM SERVER)
// ========================================

model Service {
  id          Int     @id
  code        String  @unique
  name        String
  description String?
  price       String  // Store as string for decimal precision
  duration    Int?
  active      Boolean @default(true)
  
  @@map("services")
}

// ========================================
// APPOINTMENTS (CREATED LOCALLY, SYNCED UP)
// ========================================

model Appointment {
  id                String   @id @default(uuid())
  appointmentNumber String   @unique @map("appointment_number")
  
  patientId         Int      @map("patient_id")
  doctorId          String   @map("doctor_id")
  
  appointmentDate   String   @map("appointment_date")  // ISO datetime
  status            String   @default("SCHEDULED")
  
  totalAmount       String   @map("total_amount")
  paidAmount        String   @default("0") @map("paid_amount")
  paymentStatus     String   @default("PENDING") @map("payment_status")
  
  notes             String?
  diagnosis         String?
  prescription      String?  // JSON
  
  synced            Boolean  @default(false)
  syncedAt          String?  @map("synced_at")
  
  items             AppointmentItem[]
  
  createdAt String @default("") @map("created_at")
  
  @@map("appointments")
}

model AppointmentItem {
  id            Int    @id @default(autoincrement())
  appointmentId String @map("appointment_id")
  
  serviceId     Int    @map("service_id")
  serviceName   String @map("service_name")
  
  quantity      String @default("1")
  price         String
  total         String
  
  notes         String?
  
  @@map("appointment_items")
}

// ========================================
// SYNC QUEUE (RETRY FAILED SYNCS)
// ========================================

model SyncQueue {
  id        String @id @default(uuid())
  entity    String
  entityId  String @map("entity_id")
  action    String
  payload   String  // JSON
  attempts  Int    @default(0)
  lastError String? @map("last_error")
  createdAt String @map("created_at")
  
  @@map("sync_queue")
}
```

---

## 🖨️ Receipt/Check Printing System

### Thermal Printer Integration

```typescript
// src/main/printer/thermal-printer.ts

import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer';

export class ClinicPrinter {
  private printer: ThermalPrinter;
  
  constructor() {
    this.printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: 'tcp://192.168.1.100',  // Network printer
      characterSet: 'RUSSIA',  // Supports Cyrillic
      removeSpecialCharacters: false,
      lineCharacter: '=',
      options: {
        timeout: 5000,
      },
    });
  }
  
  async printServiceReceipt(appointment: AppointmentWithItems) {
    this.printer.alignCenter();
    
    // Clinic header
    this.printer.setTextDoubleHeight();
    this.printer.bold(true);
    this.printer.println(appointment.clinicName);
    this.printer.bold(false);
    this.printer.setTextNormal();
    
    this.printer.println(appointment.clinicAddress);
    this.printer.println(`Tel: ${appointment.clinicPhone}`);
    this.printer.drawLine();
    
    // Receipt info
    this.printer.alignLeft();
    this.printer.println(`Chek: ${appointment.appointmentNumber}`);
    this.printer.println(`Sana: ${formatDate(appointment.appointmentDate)}`);
    this.printer.println(`Bemor: ${appointment.patientName}`);
    this.printer.println(`Shifokor: ${appointment.doctorName}`);
    this.printer.drawLine();
    
    // Services table
    this.printer.tableCustom([
      { text: 'Xizmat', align: 'LEFT', width: 0.5 },
      { text: 'Soni', align: 'CENTER', width: 0.15 },
      { text: 'Narx', align: 'RIGHT', width: 0.15 },
      { text: 'Summa', align: 'RIGHT', width: 0.2 },
    ]);
    this.printer.drawLine();
    
    for (const item of appointment.items) {
      this.printer.tableCustom([
        { text: item.serviceName, align: 'LEFT', width: 0.5 },
        { text: item.quantity.toString(), align: 'CENTER', width: 0.15 },
        { text: formatPrice(item.price), align: 'RIGHT', width: 0.15 },
        { text: formatPrice(item.total), align: 'RIGHT', width: 0.2 },
      ]);
    }
    
    this.printer.drawLine();
    
    // Total
    this.printer.bold(true);
    this.printer.tableCustom([
      { text: 'JAMI:', align: 'LEFT', width: 0.65 },
      { text: formatPrice(appointment.totalAmount), align: 'RIGHT', width: 0.35 },
    ]);
    this.printer.bold(false);
    
    // Payment info
    if (appointment.paidAmount > 0) {
      this.printer.println(`To'landi: ${formatPrice(appointment.paidAmount)}`);
      
      const remaining = appointment.totalAmount - appointment.paidAmount;
      if (remaining > 0) {
        this.printer.println(`Qoldiq: ${formatPrice(remaining)}`);
      }
    }
    
    this.printer.drawLine();
    
    // Footer
    this.printer.alignCenter();
    this.printer.println('Rahmat!');
    this.printer.println('Sog\'liq bo\'ling!');
    
    // QR code (optional - for online check verification)
    this.printer.printQR(`https://posclinic.bobur-dev.uz/check/${appointment.appointmentNumber}`);
    
    this.printer.cut();
    
    // Execute print
    await this.printer.execute();
  }
  
  async printPrescription(appointment: AppointmentWithPrescription) {
    this.printer.alignCenter();
    this.printer.setTextDoubleHeight();
    this.printer.bold(true);
    this.printer.println('RETSEPT');
    this.printer.bold(false);
    this.printer.setTextNormal();
    this.printer.drawLine();
    
    this.printer.alignLeft();
    this.printer.println(`Bemor: ${appointment.patientName}`);
    this.printer.println(`Tug'ilgan yil: ${appointment.patientBirthDate}`);
    this.printer.println(`Shifokor: ${appointment.doctorName}`);
    this.printer.println(`Sana: ${formatDate(appointment.appointmentDate)}`);
    this.printer.drawLine();
    
    // Diagnosis
    this.printer.bold(true);
    this.printer.println('Tashxis:');
    this.printer.bold(false);
    this.printer.println(appointment.diagnosis);
    this.printer.newLine();
    
    // Prescription
    this.printer.bold(true);
    this.printer.println('Retsept:');
    this.printer.bold(false);
    
    const prescriptionItems = JSON.parse(appointment.prescription);
    for (const item of prescriptionItems) {
      this.printer.println(`• ${item.medicine}`);
      this.printer.println(`  ${item.dosage} - ${item.frequency}`);
      this.printer.println(`  Davomiyligi: ${item.duration}`);
      this.printer.newLine();
    }
    
    this.printer.drawLine();
    
    // Doctor signature
    this.printer.alignRight();
    this.printer.println(`Shifokor: ${appointment.doctorName}`);
    this.printer.println(`Imzo: _________________`);
    
    this.printer.cut();
    await this.printer.execute();
  }
}
```

### IPC Handler for Printing

```typescript
// src/main/ipc/print-handlers.ts

ipcMain.handle('print:service-receipt', async (event, appointment) => {
  try {
    const printer = new ClinicPrinter();
    await printer.printServiceReceipt(appointment);
    return { success: true };
  } catch (error) {
    console.error('Print error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('print:prescription', async (event, appointment) => {
  try {
    const printer = new ClinicPrinter();
    await printer.printPrescription(appointment);
    return { success: true };
  } catch (error) {
    console.error('Print error:', error);
    return { success: false, error: error.message };
  }
});
```

---

## 🌐 Subdomain Setup

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/posclinic.bobur-dev.uz

# POSCLINIC Web Dashboard
server {
    listen 80;
    server_name posclinic.bobur-dev.uz;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name posclinic.bobur-dev.uz;
    
    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/posclinic.bobur-dev.uz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/posclinic.bobur-dev.uz/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Web dashboard (static files)
    location / {
        root /var/www/posclinic/web/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # API proxy
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Electron app downloads
    location /releases {
        alias /var/www/posclinic/releases;
        autoindex on;
    }
    
    # Health check
    location /health {
        proxy_pass http://localhost:4000/health;
    }
}

# API subdomain (optional - for clear separation)
server {
    listen 443 ssl http2;
    server_name api.posclinic.bobur-dev.uz;
    
    ssl_certificate /etc/letsencrypt/live/posclinic.bobur-dev.uz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/posclinic.bobur-dev.uz/privkey.pem;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL Certificate Setup

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d posclinic.bobur-dev.uz -d api.posclinic.bobur-dev.uz

# Auto-renewal (runs twice daily)
sudo systemctl enable certbot.timer
```

---

## 🔧 Environment Configuration

### Server Environment - `.env`

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/posclinic_db"

# Server
NODE_ENV=production
PORT=4000
API_URL=https://posclinic.bobur-dev.uz

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# File uploads
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# Telegram (optional - for notifications)
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_ADMIN_CHAT_ID=your-chat-id
```

### Electron Build Environment - `.env.pos`

```env
# VPS connection
VPS_API_URL=https://posclinic.bobur-dev.uz/api

# Terminal identity (baked into build)
TERMINAL_ID=CLINIC_TERMINAL_001
CLINIC_ID=clinic_xxxxx

# Sync settings
SYNC_INTERVAL_MS=60000
AUTO_UPDATE_URL=https://posclinic.bobur-dev.uz/releases
```

---

## 📦 Deployment Guide

### 1. Server Deployment (VPS)

```bash
# Clone repository
cd /var/www
git clone https://github.com/YourUsername/posclinic.git
cd posclinic

# Install dependencies
npm install

# Setup environment
cp .env.example .env
nano .env  # Edit with your values

# Setup PostgreSQL
sudo -u postgres createdb posclinic_db

# Run Prisma migrations
npx prisma migrate deploy
npx prisma generate

# Build server
npm run build:server

# Build web dashboard
cd src/web
npm install
npm run build
cd ../..

# Setup PM2 (process manager)
npm install -g pm2

# Start server
pm2 start dist/server/main.js --name posclinic-api
pm2 save
pm2 startup

# Setup Nginx
sudo cp nginx/posclinic.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/posclinic.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d posclinic.bobur-dev.uz
```

### 2. Electron App Build & Release

```bash
# Set terminal-specific environment
export TERMINAL_ID=CLINIC_001
export CLINIC_ID=clinic_xxxxx
export VPS_API_URL=https://posclinic.bobur-dev.uz/api

# Build for Windows
npm run build:pos:win

# Build for macOS
npm run build:pos:mac

# Build for Linux
npm run build:pos:linux

# Upload to VPS
scp dist/posclinic-setup-*.exe user@server:/var/www/posclinic/releases/
```

### 3. Auto-Update Configuration

```json
// electron-builder.config.js
{
  "publish": [
    {
      "provider": "generic",
      "url": "https://posclinic.bobur-dev.uz/releases"
    }
  ]
}
```

---

## 🚀 Getting Started

### For Development

```bash
# 1. Clone and install
git clone https://github.com/YourUsername/posclinic.git
cd posclinic
npm install

# 2. Setup database
createdb posclinic_db
npx prisma migrate dev
npx prisma generate

# 3. Start server (terminal 1)
npm run dev:server

# 4. Start web dashboard (terminal 2)
cd src/web
npm run dev

# 5. Start Electron app (terminal 3)
npm run dev:pos
```

### For Clinic Installation

1. **Download:** Go to `https://posclinic.bobur-dev.uz`
2. **Login** with super admin credentials
3. **Create clinic** in admin dashboard
4. **Download terminal app** with clinic-specific credentials
5. **Install** on clinic PC
6. **Login** and start using

---

## 📊 Features Roadmap

### Phase 1 (MVP - 2 weeks)
- ✅ Multi-clinic management
- ✅ Patient registration
- ✅ Service catalog
- ✅ Appointment booking
- ✅ Service checkout
- ✅ Receipt printing
- ✅ Basic reports

### Phase 2 (1 month)
- ⚪ Prescription management
- ⚪ Medical history tracking
- ⚪ Doctor schedules
- ⚪ SMS notifications
- ⚪ Payment integrations (Click, Payme)
- ⚪ Advanced reports

### Phase 3 (3 months)
- ⚪ Patient-facing website
- ⚪ Online appointment booking
- ⚪ Mobile app for patients
- ⚪ Insurance integration
- ⚪ Lab result uploads
- ⚪ Telegram bot

---

## 🎯 Next Immediate Steps

1. **Create GitHub Repository**
   ```bash
   git init
   git remote add origin https://github.com/YourUsername/posclinic.git
   ```

2. **Setup Initial Structure**
   ```bash
   npm init -y
   npm install @nestjs/core @nestjs/common @prisma/client
   npm install -D typescript @types/node prisma
   ```

3. **Create Prisma Schemas**
   - Copy PostgreSQL schema above
   - Copy SQLite schema above
   - Run `npx prisma generate`

4. **Start with Auth Module**
   - Implement JWT authentication
   - Create super admin user
   - Build login page

5. **Build Clinic Management**
   - Create clinic CRUD
   - Admin dashboard
   - Clinic list/detail pages

---

**This is your complete blueprint! Ready to start building?** 🚀
