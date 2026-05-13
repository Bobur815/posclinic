import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { log } from '../logger';

interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  lastError: string | null;
}

export class SyncService {
  private status: SyncStatus = {
    isSyncing: false,
    lastSyncTime: null,
    lastError: null,
  };

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private serverToken: string | null = null;

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  setToken(token: string): void {
    this.serverToken = token;
  }

  start(intervalMs?: number): void {
    const config = getAppConfig();
    const ms = intervalMs ?? config.syncIntervalMs;
    log.info(`[sync] Starting sync service, interval=${ms}ms`);
    this.intervalId = setInterval(() => {
      this.triggerSync().catch((err) =>
        log.error('[sync] Background sync failed:', err),
      );
    }, ms);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    log.info('[sync] Sync service stopped');
  }

  async triggerSync(): Promise<void> {
    if (this.status.isSyncing) return;
    this.status.isSyncing = true;
    this.status.lastError = null;

    try {
      await this.pullData();
      await this.pushAppointments();
      this.status.lastSyncTime = new Date();
      log.info('[sync] Sync completed successfully');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.status.lastError = msg;
      log.error('[sync] Sync failed:', msg);
    } finally {
      this.status.isSyncing = false;
    }
  }

  private async pullData(): Promise<void> {
    const config = getAppConfig();
    if (!this.serverToken) return;

    try {
      const response = await fetch(`${config.vpsApiUrl}/sync/pull`, {
        headers: {
          Authorization: `Bearer ${this.serverToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Pull failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        patients?: unknown[];
        doctors?: unknown[];
        services?: unknown[];
      };

      const prisma = getPrismaClient();

      // Upsert patients
      if (data.patients && Array.isArray(data.patients)) {
        for (const patient of data.patients as Record<string, unknown>[]) {
          await prisma.$executeRaw`
            INSERT OR REPLACE INTO patients (id, patient_code, full_name, phone, birth_date, gender, blood_type, allergies, address, city, notes, active, created_at, updated_at)
            VALUES (${patient.id}, ${patient.patientCode}, ${patient.fullName}, ${patient.phone}, ${patient.birthDate ?? null}, ${patient.gender ?? null}, ${patient.bloodType ?? null}, ${patient.allergies ?? null}, ${patient.address ?? null}, ${patient.city ?? null}, ${patient.notes ?? null}, 1, ${patient.createdAt}, ${patient.updatedAt})
          `;
        }
      }

      // Upsert doctors
      if (data.doctors && Array.isArray(data.doctors)) {
        for (const doctor of data.doctors as Record<string, unknown>[]) {
          await prisma.$executeRaw`
            INSERT OR REPLACE INTO doctors (id, full_name, phone, specialty, license_no, active, created_at, updated_at)
            VALUES (${doctor.id}, ${doctor.fullName}, ${doctor.phone ?? null}, ${doctor.specialty ?? null}, ${doctor.licenseNo ?? null}, 1, ${doctor.createdAt}, ${doctor.updatedAt})
          `;
        }
      }

      // Upsert services
      if (data.services && Array.isArray(data.services)) {
        for (const service of data.services as Record<string, unknown>[]) {
          await prisma.$executeRaw`
            INSERT OR REPLACE INTO services (id, code, name, description, price, duration, active, created_at, updated_at)
            VALUES (${service.id}, ${service.code}, ${service.name}, ${service.description ?? null}, ${service.price}, ${service.duration ?? 30}, 1, ${service.createdAt}, ${service.updatedAt})
          `;
        }
      }
    } catch (error) {
      log.warn('[sync] Pull failed (may be offline):', error);
    }
  }

  private async pushAppointments(): Promise<void> {
    const config = getAppConfig();
    if (!this.serverToken) return;

    const prisma = getPrismaClient();

    try {
      const unsynced = await prisma.appointment.findMany({
        where: { synced: false },
        include: { items: true },
        take: 50,
      });

      if (unsynced.length === 0) return;

      const response = await fetch(`${config.vpsApiUrl}/sync/push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.serverToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appointments: unsynced }),
      });

      if (!response.ok) {
        throw new Error(`Push failed: ${response.status}`);
      }

      const result = (await response.json()) as { syncedIds: string[] };

      for (const id of result.syncedIds ?? []) {
        await prisma.appointment.update({
          where: { id },
          data: { synced: true, syncedAt: new Date() },
        });
      }

      log.info(`[sync] Pushed ${result.syncedIds?.length ?? 0} appointments`);
    } catch (error) {
      log.warn('[sync] Push failed (may be offline):', error);
    }
  }
}
