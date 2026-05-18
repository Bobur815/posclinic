import { Injectable } from '@nestjs/common';
import type { SyncPullResponse, SyncPushResponse } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import type { SyncAppointmentDto } from './dto/sync-push.dto';

@Injectable()
export class SyncService {
  constructor(private prisma: PrismaService) {}

  async pullData(clinicId: string, lastSyncTime?: string): Promise<SyncPullResponse> {
    const since = lastSyncTime ? new Date(lastSyncTime) : new Date(0);

    const [patients, doctors, services] = await Promise.all([
      this.prisma.patient.findMany({
        where: { clinicId, updatedAt: { gt: since } },
        orderBy: { updatedAt: 'asc' },
      }),
      this.prisma.doctor.findMany({
        where: { clinicId, updatedAt: { gt: since } },
        orderBy: { updatedAt: 'asc' },
      }),
      this.prisma.service.findMany({
        where: { clinicId, updatedAt: { gt: since } },
        orderBy: { updatedAt: 'asc' },
      }),
    ]);

    return {
      patients,
      doctors,
      services,
      syncTime: new Date().toISOString(),
    } as unknown as SyncPullResponse;
  }

  async pushAppointments(
    clinicId: string,
    appointments: SyncAppointmentDto[],
  ): Promise<SyncPushResponse> {
    const results: string[] = [];

    for (const appt of appointments) {
      try {
        await this.prisma.appointment.upsert({
          where: { id: appt.id },
          create: {
            id: appt.id,
            clinicId,
            appointmentNumber: appt.appointmentNumber,
            patientId: appt.patientId,
            doctorId: appt.doctorId,
            appointmentDate: new Date(appt.appointmentDate),
            status: appt.status as never,
            paymentStatus: appt.paymentStatus as never,
            paymentMethod: appt.paymentMethod as never,
            totalAmount: appt.totalAmount,
            paidAmount: appt.paidAmount,
            diagnosis: appt.diagnosis,
            prescription: appt.prescription,
            notes: appt.notes,
            items: {
              create: appt.items.map((item) => ({
                serviceId: item.serviceId,
                serviceName: item.serviceName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: item.total,
              })),
            },
          },
          update: {
            status: appt.status as never,
            paymentStatus: appt.paymentStatus as never,
            paymentMethod: appt.paymentMethod as never,
            paidAmount: appt.paidAmount,
            diagnosis: appt.diagnosis,
            prescription: appt.prescription,
            notes: appt.notes,
          },
        });
        results.push(appt.id);
      } catch (err) {
        console.error(`Failed to sync appointment ${appt.id}:`, err);
      }
    }

    return { synced: results.length, ids: results };
  }
}
