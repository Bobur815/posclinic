import { Injectable } from '@nestjs/common';
import { dayRange, monthRange } from '../../common/dates';
import { PrismaService } from '../../prisma/prisma.service';
import { aggregate } from './report-core';

const strip = ({
  id: _id,
  ...rest
}: {
  id: string;
  name: string;
  count: number;
  revenue: number;
}) => rest;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Visits of `clinicId` with appointmentDate in [from, to). */
  async visits(clinicId: string, from: Date, to: Date) {
    return this.prisma.appointment.findMany({
      where: { clinicId, appointmentDate: { gte: from, lt: to } },
      select: {
        status: true,
        appointmentDate: true,
        totalAmount: true,
        paidAmount: true,
        doctor: { select: { id: true, fullName: true } },
        items: { select: { serviceId: true, serviceName: true, quantity: true, total: true } },
      },
    });
  }

  private report(a: ReturnType<typeof aggregate>, withDays: boolean) {
    return {
      totals: { visits: a.visits, revenue: a.billed, paid: a.paid, debt: a.debt },
      byDoctor: a.byDoctor,
      byService: a.byService,
      ...(withDays ? { byDay: a.byDay } : {}),
    };
  }

  async daily(clinicId: string, date?: string) {
    const { from, to } = dayRange(date);
    return this.report(aggregate(await this.visits(clinicId, from, to)), false);
  }

  async monthly(clinicId: string, month?: string) {
    const { from, to } = monthRange(month);
    return this.report(aggregate(await this.visits(clinicId, from, to)), true);
  }

  async summary(clinicId: string, date?: string) {
    const { from, to } = dayRange(date);
    const [rows, newPatients] = await Promise.all([
      this.visits(clinicId, from, to),
      this.prisma.patient.count({ where: { clinicId, createdAt: { gte: from, lt: to } } }),
    ]);
    const a = aggregate(rows);
    return {
      visits: a.visits,
      completed: a.completed,
      cancelled: a.cancelled,
      revenue: a.paid,
      debt: a.debt,
      newPatients,
      topServices: a.byService.slice(0, 5).map(strip),
      topDoctors: a.byDoctor.slice(0, 5).map(strip),
    };
  }
}
