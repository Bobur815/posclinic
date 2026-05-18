import { Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, type PaymentMethod, PaymentStatus } from '@prisma/client';
import { format } from 'date-fns';
import type {
  AppointmentCreateResponse,
  AppointmentDetailResult,
  AppointmentListResponse,
  AppointmentMutationResponse,
  TodaySummaryResponse,
} from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import type { CheckoutDto } from './dto/checkout.dto';
import type { CreateAppointmentDto } from './dto/create-appointment.dto';
import type { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  private async generateAppointmentNumber(clinicId: string): Promise<string> {
    const today = format(new Date(), 'yyyyMMdd');
    const prefix = `A${today}-`;
    const count = await this.prisma.appointment.count({
      where: { clinicId, appointmentNumber: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(3, '0')}`;
  }

  async findAll(
    clinicId: string,
    filters?: { today?: boolean; status?: string; date?: string },
  ): Promise<AppointmentListResponse> {
    const where: Record<string, unknown> = { clinicId };

    if (filters?.today) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      where.appointmentDate = { gte: start, lte: end };
    } else if (filters?.date) {
      const start = new Date(`${filters.date}T00:00:00`);
      const end = new Date(`${filters.date}T23:59:59`);
      where.appointmentDate = { gte: start, lte: end };
    }

    if (filters?.status) where.status = filters.status;

    const rows = await this.prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { fullName: true, phone: true } },
        doctor: { select: { fullName: true } },
        items: true,
      },
      orderBy: { appointmentDate: 'desc' },
    });
    return rows as unknown as AppointmentListResponse;
  }

  async findById(id: string): Promise<AppointmentDetailResult> {
    const appt = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, fullName: true, phone: true, patientCode: true } },
        doctor: { select: { fullName: true, specialty: true } },
        items: true,
      },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt as unknown as AppointmentDetailResult;
  }

  async create(clinicId: string, data: CreateAppointmentDto): Promise<AppointmentCreateResponse> {
    const appointmentNumber = await this.generateAppointmentNumber(clinicId);
    const totalAmount = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    return this.prisma.appointment.create({
      data: {
        appointmentNumber,
        clinicId,
        patientId: data.patientId,
        doctorId: data.doctorId,
        appointmentDate: new Date(data.appointmentDate),
        notes: data.notes,
        totalAmount,
        items: {
          create: data.items.map((item) => ({
            serviceId: item.serviceId,
            serviceName: item.serviceName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
          })),
        },
      },
      include: { items: true },
    }) as unknown as Promise<AppointmentCreateResponse>;
  }

  async update(id: string, data: UpdateAppointmentDto): Promise<AppointmentMutationResponse> {
    const appt = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('Appointment not found');
    const updated = await this.prisma.appointment.update({
      where: { id },
      data,
      include: {
        patient: { select: { fullName: true, phone: true } },
        doctor: { select: { fullName: true } },
        items: true,
      },
    });
    return updated as unknown as AppointmentMutationResponse;
  }

  async checkout(id: string, data: CheckoutDto): Promise<AppointmentMutationResponse> {
    const appt = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('Appointment not found');

    const newPaidAmount = Number(appt.paidAmount) + data.amount;
    const isPaid = newPaidAmount >= Number(appt.totalAmount);

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        paidAmount: newPaidAmount,
        paymentStatus: isPaid ? PaymentStatus.PAID : PaymentStatus.PARTIAL,
        paymentMethod: data.paymentMethod as PaymentMethod,
        status: isPaid ? AppointmentStatus.COMPLETED : appt.status,
      },
      include: {
        patient: { select: { fullName: true, phone: true } },
        doctor: { select: { fullName: true } },
        items: true,
      },
    });
    return updated as unknown as AppointmentMutationResponse;
  }

  async getTodaySummary(clinicId: string): Promise<TodaySummaryResponse> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const appointments = await this.prisma.appointment.findMany({
      where: { clinicId, appointmentDate: { gte: start, lte: end } },
    });

    return {
      total: appointments.length,
      completed: appointments.filter((a) => a.status === AppointmentStatus.COMPLETED).length,
      pending: appointments.filter((a) => a.status === AppointmentStatus.SCHEDULED).length,
      revenue: appointments.reduce((sum, a) => sum + Number(a.paidAmount), 0),
    };
  }
}
