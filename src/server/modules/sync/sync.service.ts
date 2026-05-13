import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SyncService {
  constructor(private prisma: PrismaService) {}

  /**
   * Pull endpoint — returns data for the terminal to pull down:
   * patients, doctors, services for a given clinic.
   */
  async pullData(clinicId: string, lastSyncTime?: string) {
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

    return { patients, doctors, services, syncTime: new Date().toISOString() };
  }

  /**
   * Push endpoint — terminals push their locally-created appointments to the server.
   */
  async pushAppointments(clinicId: string, appointments: Array<{
    id: string;
    appointmentNumber: string;
    patientId: string;
    doctorId: string;
    appointmentDate: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string | null;
    totalAmount: number;
    paidAmount: number;
    diagnosis: string | null;
    prescription: string | null;
    notes: string | null;
    items: Array<{
      serviceId: string;
      serviceName: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
  }>) {
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
